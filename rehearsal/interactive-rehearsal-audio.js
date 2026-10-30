const STORAGE_KEY = 'seprepare-interactive-rehearsal-v1';
const MAX_VOICE_ENTRIES = 300;

let memoryStore = null;

function clampRate(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0.5, Math.min(1.8, Number(fallback) || 1));
  return Math.round(Math.max(0.5, Math.min(1.8, n)) * 10) / 10;
}

function normalizeSilence(value) {
  const n = Number(value);
  return [2, 3, 5].includes(n) ? n : 3;
}

function defaultPrefs() {
  return {
    mode: 'manual',
    silenceSeconds: 3,
    hideMyLines: false,
    showHints: true,
    participantVoices: {}
  };
}

function readRawPrefs() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return memoryStore ? JSON.parse(JSON.stringify(memoryStore)) : null;
}

function writeRawPrefs(prefs) {
  memoryStore = JSON.parse(JSON.stringify(prefs));
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    }
  } catch {}
}

export function loadRehearsalPreferences() {
  const raw = readRawPrefs();
  if (!raw || typeof raw !== 'object') return defaultPrefs();
  const voices = {};
  if (raw.participantVoices && typeof raw.participantVoices === 'object') {
    const entries = Object.entries(raw.participantVoices).slice(-MAX_VOICE_ENTRIES);
    for (const [k, v] of entries) {
      if (v && typeof v === 'object') {
        voices[k] = {
          voice: typeof v.voice === 'string' ? v.voice.slice(0, 300) : '',
          locale: typeof v.locale === 'string' ? v.locale.slice(0, 40) : '',
          rate: clampRate(v.rate, 1),
          updatedAt: Number(v.updatedAt) || 0
        };
      }
    }
  }
  return {
    mode: raw.mode === 'auto' ? 'auto' : 'manual',
    silenceSeconds: normalizeSilence(raw.silenceSeconds),
    hideMyLines: raw.hideMyLines === true,
    showHints: raw.showHints !== false,
    participantVoices: voices
  };
}

export function saveRehearsalPreferences(patch = {}) {
  const current = loadRehearsalPreferences();
  const next = {
    mode: patch.mode !== undefined ? (patch.mode === 'auto' ? 'auto' : 'manual') : current.mode,
    silenceSeconds: patch.silenceSeconds !== undefined ? normalizeSilence(patch.silenceSeconds) : current.silenceSeconds,
    hideMyLines: patch.hideMyLines !== undefined ? patch.hideMyLines === true : current.hideMyLines,
    showHints: patch.showHints !== undefined ? patch.showHints !== false : current.showHints,
    participantVoices: { ...current.participantVoices, ...(patch.participantVoices || {}) }
  };
  const keys = Object.keys(next.participantVoices);
  if (keys.length > MAX_VOICE_ENTRIES) {
    keys
      .sort((a, b) => (next.participantVoices[a]?.updatedAt || 0) - (next.participantVoices[b]?.updatedAt || 0))
      .slice(0, keys.length - MAX_VOICE_ENTRIES)
      .forEach(k => delete next.participantVoices[k]);
  }
  writeRawPrefs(next);
  return next;
}

export function voiceEntryKey(speechId, participantId) {
  return `${String(speechId || 'global')}:${String(participantId || '')}`;
}

export function createRehearsalAudio({ player, getSettings, t = s => s }) {
  let generation = 0;
  let activeRequestId = null;
  let activeKind = 'idle'; // 'idle' | 'turn' | 'preview'
  let onExternalStop = null;

  const localeFromSettings = () => {
    const s = (typeof getSettings === 'function' ? getSettings() : {}) || {};
    const explicit = String(s.audioLanguage || '').trim();
    if (explicit) return explicit;
    const lang = String(s.language || 'pt-BR').split('-')[0].toLowerCase();
    return { pt: 'pt-BR', en: 'en-US', es: 'es-ES', ja: 'ja-JP' }[lang] || 'pt-BR';
  };

  const baseRate = () => {
    const s = (typeof getSettings === 'function' ? getSettings() : {}) || {};
    return clampRate(s.rate, 1);
  };

  if (player && typeof player.setExternalInterruptHandler === 'function') {
    player.setExternalInterruptHandler(reason => {
      generation += 1;
      activeRequestId = null;
      const wasActive = activeKind !== 'idle';
      activeKind = 'idle';
      if (wasActive && typeof onExternalStop === 'function') {
        onExternalStop(reason || 'external-audio');
      }
    });
  }

  function listCatalog(preferredLocale) {
    const targetLocale = preferredLocale || localeFromSettings();
    if (player && typeof player.getAvailableVoices === 'function') {
      const info = player.getAvailableVoices(targetLocale);
      if (info && Array.isArray(info.voices)) {
        return {
          status: info.status || 'ready',
          locale: info.locale || targetLocale,
          voices: info.voices,
          allVoices: Array.isArray(info.allVoices) && info.allVoices.length ? info.allVoices : info.voices
        };
      }
    }
    return { status: 'ready', locale: targetLocale, voices: [], allVoices: [] };
  }

  function resolveParticipantVoices(participants = [], speechId = '') {
    const prefs = loadRehearsalPreferences();
    const catalog = listCatalog();
    const langPrefix = String(catalog.locale || 'pt-BR').split(/[-_]/)[0].toLowerCase();
    const localeVoices = catalog.voices.filter(
      v => String(v.locale || '').split(/[-_]/)[0].toLowerCase() === langPrefix
    );
    const pool = localeVoices.length ? localeVoices : catalog.voices;
    const allVoices = catalog.allVoices || pool;
    const defaultRate = baseRate();

    const assignments = new Map();
    participants.forEach((p, idx) => {
      const key = voiceEntryKey(speechId, p.id);
      const saved = prefs.participantVoices[key] || null;
      const rate = saved ? clampRate(saved.rate, defaultRate) : defaultRate;
      const autoCandidate = pool.length ? pool[idx % pool.length] : null;

      if (saved && saved.voice) {
        const exact = allVoices.find(
          v =>
            v.name === saved.voice ||
            (saved.locale && v.name === saved.voice && v.locale === saved.locale) ||
            `${v.name}\u001f${v.locale}` === saved.voice
        );
        if (exact) {
          assignments.set(p.id, {
            participantId: p.id,
            voice: exact.name,
            locale: exact.locale || catalog.locale,
            label: exact.label || `${exact.name} · ${exact.locale}`,
            rate,
            source: 'manual',
            fallbackUsed: false
          });
          return;
        }
      }

      if (autoCandidate) {
        assignments.set(p.id, {
          participantId: p.id,
          voice: autoCandidate.name,
          locale: autoCandidate.locale || catalog.locale,
          label: autoCandidate.label || `${autoCandidate.name} · ${autoCandidate.locale}`,
          rate,
          source: saved?.voice ? 'fallback' : 'auto',
          fallbackUsed: Boolean(saved?.voice)
        });
      } else {
        assignments.set(p.id, {
          participantId: p.id,
          voice: '',
          locale: catalog.locale,
          label: t('Automática (idioma do aplicativo)'),
          rate,
          source: saved?.voice ? 'fallback' : 'system',
          fallbackUsed: Boolean(saved?.voice)
        });
      }
    });

    return {
      locale: catalog.locale,
      status: catalog.status,
      voices: pool,
      allVoices,
      assignments
    };
  }

  function setParticipantVoice(speechId, participantId, { voice = '', locale = '', rate } = {}) {
    const prefs = loadRehearsalPreferences();
    const key = voiceEntryKey(speechId, participantId);
    const nextVoices = { ...prefs.participantVoices };
    const cleanVoice = String(voice || '').trim();
    const cleanLocale = String(locale || '').trim();
    const cleanRate = clampRate(rate, baseRate());
    if (!cleanVoice && cleanRate === baseRate()) {
      delete nextVoices[key];
    } else {
      nextVoices[key] = {
        voice: cleanVoice,
        locale: cleanLocale,
        rate: cleanRate,
        updatedAt: Date.now()
      };
    }
    return saveRehearsalPreferences({ participantVoices: nextVoices });
  }

  function getSavedParticipantVoice(speechId, participantId) {
    const prefs = loadRehearsalPreferences();
    return prefs.participantVoices[voiceEntryKey(speechId, participantId)] || null;
  }

  function cancel() {
    generation += 1;
    const req = activeRequestId;
    activeRequestId = null;
    activeKind = 'idle';
    if (req && player && typeof player.cancelSegment === 'function') {
      player.cancelSegment(req);
    }
  }

  function speakTurn({
    turn,
    participants = [],
    speechId = '',
    title = '',
    offset = 0,
    onStart,
    onBoundary,
    onEnd,
    onError,
    onBlocked,
    onPaused
  }) {
    cancel();
    if (!turn || !turn.spokenText) {
      queueMicrotask(() => onEnd?.());
      return { sessionToken: generation, started: true };
    }
    if (!player || typeof player.speakSegment !== 'function') {
      const err = {
        code: 'synthesis-unavailable',
        message: t('Este dispositivo não disponibilizou leitura em voz alta.')
      };
      onError?.(err);
      return { sessionToken: generation, started: false };
    }

    const token = ++generation;
    activeKind = 'turn';
    const participantList = Array.isArray(participants) && participants.length
      ? participants
      : [{ id: turn.participantId, name: turn.participantName }];
    const { assignments, locale } = resolveParticipantVoices(participantList, speechId);
    const chosen = assignments.get(turn.participantId) || {
      voice: '',
      locale,
      rate: baseRate()
    };

    let settled = false;
    const reqId = player.speakSegment({
      title: title || turn.participantName || t('Ensaio interativo'),
      text: turn.spokenText,
      offset: Math.max(0, Number(offset) || 0),
      voice: chosen.voice,
      locale: chosen.locale || locale,
      rate: chosen.rate,
      onStart: () => {
        if (token !== generation || settled) return;
        onStart?.({ voice: chosen });
      },
      onBoundary: info => {
        if (token !== generation || settled) return;
        onBoundary?.(info);
      },
      onEnd: () => {
        if (token !== generation || settled) return;
        settled = true;
        activeRequestId = null;
        activeKind = 'idle';
        onEnd?.();
      },
      onPaused: () => {
        if (token !== generation || settled) return;
        settled = true;
        activeRequestId = null;
        activeKind = 'idle';
        onPaused?.();
      },
      onError: err => {
        if (token !== generation || settled) return;
        settled = true;
        activeRequestId = null;
        activeKind = 'idle';
        const code = String(err?.code || 'synthesis-failed');
        if (code === 'not-allowed' || code === 'startup-timeout') {
          onBlocked?.({
            code,
            message:
              err?.message ||
              t('A reprodução automática foi bloqueada pelo navegador. Toque em Reproduzir fala para continuar.')
          });
        } else {
          onError?.({
            code,
            message: err?.message || t('Não foi possível reproduzir esta fala.')
          });
        }
      }
    });

    if (!reqId) {
      if (!settled && token === generation) {
        activeKind = 'idle';
      }
      return { sessionToken: token, started: false };
    }
    if (!settled && token === generation) {
      activeRequestId = reqId;
    }
    return { sessionToken: token, started: true };
  }

  function previewVoice({ voice = '', locale = '', rate = 1, sampleText = '', onEnd, onError }) {
    cancel();
    if (!player || typeof player.speakSegment !== 'function') {
      onError?.({ code: 'synthesis-unavailable', message: t('Leitura em voz alta indisponível.') });
      return false;
    }
    const token = ++generation;
    activeKind = 'preview';
    const text = String(sampleText || '').trim() || t('Olá! Esta é uma fala de teste para o ensaio interativo.');
    const reqId = player.speakSegment({
      title: t('Teste de voz'),
      text,
      offset: 0,
      voice,
      locale: locale || localeFromSettings(),
      rate: clampRate(rate, baseRate()),
      onEnd: () => {
        if (token !== generation) return;
        activeRequestId = null;
        activeKind = 'idle';
        onEnd?.();
      },
      onPaused: () => {
        if (token !== generation) return;
        activeRequestId = null;
        activeKind = 'idle';
        onEnd?.();
      },
      onError: err => {
        if (token !== generation) return;
        activeRequestId = null;
        activeKind = 'idle';
        onError?.(err);
      }
    });
    if (!reqId) {
      activeKind = 'idle';
      return false;
    }
    activeRequestId = reqId;
    return true;
  }

  return {
    listCatalog,
    resolveParticipantVoices,
    setParticipantVoice,
    getSavedParticipantVoice,
    speakTurn,
    previewVoice,
    cancel,
    isSpeaking: () => activeKind !== 'idle',
    getActiveKind: () => activeKind,
    onExternalInterrupt: fn => {
      onExternalStop = typeof fn === 'function' ? fn : null;
    }
  };
}
