const SAMPLE_INTERVAL_MS = 60;
const UI_EMIT_INTERVAL_MS = 180;
const CALIBRATION_MS = 240;
const SPEECH_ONSET_CONFIRM_MS = 240;
const SPEECH_RESUME_CONFIRM_MS = 120;

function computeRms(analyser, floatBuf, byteBuf) {
  if (typeof analyser.getFloatTimeDomainData === 'function' && floatBuf) {
    analyser.getFloatTimeDomainData(floatBuf);
    let sum = 0;
    let validCount = 0;
    for (let i = 0; i < floatBuf.length; i += 1) {
      const s = floatBuf[i];
      if (Number.isFinite(s)) {
        sum += s * s;
        validCount += 1;
      }
    }
    const rms = validCount > 0 ? Math.sqrt(sum / validCount) : 0;
    if (rms > 0 || typeof analyser.getByteTimeDomainData !== 'function' || !byteBuf) {
      return rms;
    }
  }
  if (typeof analyser.getByteTimeDomainData === 'function' && byteBuf) {
    analyser.getByteTimeDomainData(byteBuf);
    let sum = 0;
    for (let i = 0; i < byteBuf.length; i += 1) {
      const s = (byteBuf[i] - 128) / 128;
      sum += s * s;
    }
    return Math.sqrt(sum / Math.max(1, byteBuf.length));
  }
  return 0;
}

function classifyMediaError(err, t) {
  const name = String(err?.name || err?.code || '');
  if (/NotAllowedError|PermissionDeniedError|SecurityError|permission-denied/i.test(name)) {
    return {
      code: 'permission-denied',
      message: t('Permissão do microfone não concedida. Continuando no modo Manual.')
    };
  }
  if (/NotFoundError|DevicesNotFoundError|OverconstrainedError/i.test(name)) {
    return {
      code: 'mic-unavailable',
      message: t('Nenhum microfone disponível foi encontrado. Continuando no modo Manual.')
    };
  }
  if (/NotReadableError|TrackStartError|AbortError|mic-busy/i.test(name)) {
    return {
      code: 'mic-busy',
      message: t('Não foi possível acessar o microfone no momento. Continuando no modo Manual.')
    };
  }
  return {
    code: 'audio-error',
    message: t('A detecção automática não pôde ser iniciada. Continuando no modo Manual.')
  };
}

function parseJsonSafe(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

export function createRehearsalVad(options = {}) {
  const {
    nativeBridge = options.mediaDevices ? null : (typeof window !== 'undefined' ? window.OradorNative : null),
    eventTarget = typeof window !== 'undefined' ? window : null,
    mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : null,
    AudioContextClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null,
    now = () => Date.now(),
    setIntervalFn = (fn, ms) => setInterval(fn, ms),
    clearIntervalFn = id => clearInterval(id),
    setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
    clearTimeoutFn = id => clearTimeout(id),
    t = s => s
  } = options;

  let sessionToken = 0;
  let turnToken = 0;
  let activeBackend = null; // 'native' | 'web' | null
  let nativeReady = false;
  let nativeErrorListener = null;
  let sessionLossCallback = null;
  let isListeningTurn = false;

  let stream = null;
  let audioCtx = null;
  let sourceNode = null;
  let analyser = null;
  let silentGain = null;
  let floatBuf = null;
  let byteBuf = null;
  let timerId = null;
  let trackEndedListeners = [];

  function hasNativeMic() {
    return Boolean(
      nativeBridge &&
      typeof nativeBridge.startMicMonitor === 'function' &&
      typeof nativeBridge.pollMicMonitor === 'function' &&
      typeof nativeBridge.stopMicMonitor === 'function'
    );
  }

  function hasWebMic() {
    return Boolean(
      mediaDevices &&
      typeof mediaDevices.getUserMedia === 'function' &&
      typeof AudioContextClass === 'function'
    );
  }

  function clearTimer() {
    if (timerId !== null) {
      clearIntervalFn(timerId);
      timerId = null;
    }
  }

  function setTracksEnabled(enabled) {
    if (!stream || typeof stream.getAudioTracks !== 'function') return;
    for (const track of stream.getAudioTracks()) {
      try {
        track.enabled = Boolean(enabled);
      } catch {}
    }
  }

  function detachTrackListeners() {
    for (const { track, handler } of trackEndedListeners) {
      try {
        track.removeEventListener('ended', handler);
      } catch {}
    }
    trackEndedListeners = [];
  }

  function detachNativeErrorListener() {
    if (nativeErrorListener && eventTarget && typeof eventTarget.removeEventListener === 'function') {
      try {
        eventTarget.removeEventListener('nativeMicError', nativeErrorListener);
      } catch {}
    }
    nativeErrorListener = null;
  }

  function teardownWebStreamOnly() {
    detachTrackListeners();
    if (sourceNode) {
      try { sourceNode.disconnect(); } catch {}
      sourceNode = null;
    }
    if (analyser) {
      try { analyser.disconnect(); } catch {}
      analyser = null;
    }
    if (silentGain) {
      try { silentGain.disconnect(); } catch {}
      silentGain = null;
    }
    if (stream && typeof stream.getTracks === 'function') {
      for (const track of stream.getTracks()) {
        try { track.stop(); } catch {}
      }
    }
    stream = null;
    floatBuf = null;
    byteBuf = null;
  }

  function stopListening() {
    turnToken += 1;
    isListeningTurn = false;
    clearTimer();
    if (hasNativeMic()) {
      try { nativeBridge.stopMicMonitor(); } catch {}
    }
    setTracksEnabled(false);
  }

  function release() {
    sessionToken += 1;
    stopListening();
    activeBackend = null;
    nativeReady = false;
    sessionLossCallback = null;
    detachNativeErrorListener();
    teardownWebStreamOnly();
    if (audioCtx) {
      const ctx = audioCtx;
      audioCtx = null;
      try {
        if (ctx.state !== 'closed' && typeof ctx.close === 'function') {
          Promise.resolve(ctx.close()).catch(() => {});
        }
      } catch {}
    }
  }

  function isSupported() {
    return hasNativeMic() || hasWebMic();
  }

  async function requestNativePermissionIfNeeded(mySession) {
    let granted = false;
    try {
      granted = typeof nativeBridge.hasMicPermission === 'function'
        ? Boolean(nativeBridge.hasMicPermission())
        : true;
    } catch {
      granted = false;
    }
    if (granted) return { ok: true, granted: true };
    if (typeof nativeBridge.requestMicPermission !== 'function') {
      return { ok: false, granted: false };
    }

    const permGranted = await new Promise(resolve => {
      let settled = false;
      const finish = val => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) clearTimeoutFn(timeoutId);
        if (eventTarget && typeof eventTarget.removeEventListener === 'function') {
          try { eventTarget.removeEventListener('nativeMicPermission', onEvent); } catch {}
        }
        resolve(Boolean(val));
      };
      const onEvent = ev => {
        finish(Boolean(ev?.detail?.granted));
      };
      const timeoutId = setTimeoutFn(() => {
        let fallbackCheck = false;
        try { fallbackCheck = Boolean(nativeBridge.hasMicPermission?.()); } catch {}
        finish(fallbackCheck);
      }, 60000);

      if (eventTarget && typeof eventTarget.addEventListener === 'function') {
        eventTarget.addEventListener('nativeMicPermission', onEvent);
      }
      try {
        nativeBridge.requestMicPermission();
      } catch {
        finish(false);
      }
    });

    if (mySession !== sessionToken) {
      return { ok: false, cancelled: true };
    }
    return { ok: permGranted, granted: permGranted };
  }

  async function ensureNativeSession(mySession, onStreamLost) {
    if (activeBackend === 'native' && nativeReady) {
      let stillPermitted = true;
      try {
        if (typeof nativeBridge.hasMicPermission === 'function') {
          stillPermitted = Boolean(nativeBridge.hasMicPermission());
        }
      } catch {}
      if (stillPermitted) {
        if (onStreamLost) sessionLossCallback = onStreamLost;
        return { ok: true };
      }
    }

    const perm = await requestNativePermissionIfNeeded(mySession);
    if (perm.cancelled || mySession !== sessionToken) {
      return { ok: false, code: 'cancelled', message: '' };
    }
    if (!perm.granted) {
      return { ok: false, ...classifyMediaError({ code: 'permission-denied' }, t) };
    }

    if (typeof nativeBridge.probeMicMonitor === 'function') {
      const probe = parseJsonSafe(nativeBridge.probeMicMonitor());
      if (mySession !== sessionToken) {
        return { ok: false, code: 'cancelled', message: '' };
      }
      if (!probe?.ok) {
        return { ok: false, ...classifyMediaError({ code: probe?.code || 'mic-busy' }, t) };
      }
    }

    detachNativeErrorListener();
    sessionLossCallback = onStreamLost || sessionLossCallback;
    if (eventTarget && typeof eventTarget.addEventListener === 'function') {
      nativeErrorListener = () => {
        if (mySession !== sessionToken || !isListeningTurn) return;
        const cb = sessionLossCallback;
        release();
        cb?.({
          code: 'stream-lost',
          message: t('O microfone foi desconectado ou interrompido. Continuando no modo Manual.')
        });
      };
      eventTarget.addEventListener('nativeMicError', nativeErrorListener);
    }

    activeBackend = 'native';
    nativeReady = true;
    return { ok: true };
  }

  async function acquireWebStreamWithFallback(mySession) {
    const attempts = [
      {
        constraints: {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        },
        delayMs: 0
      },
      {
        constraints: { audio: true },
        delayMs: 120
      },
      {
        constraints: { audio: true },
        delayMs: 280
      }
    ];

    let lastErr = null;
    for (let i = 0; i < attempts.length; i += 1) {
      const { constraints, delayMs } = attempts[i];
      if (delayMs > 0) {
        await new Promise(r => setTimeoutFn(r, delayMs));
        if (mySession !== sessionToken) {
          return { ok: false, cancelled: true };
        }
      }
      try {
        const candidate = await mediaDevices.getUserMedia(constraints);
        if (mySession !== sessionToken) {
          if (candidate && typeof candidate.getTracks === 'function') {
            for (const tr of candidate.getTracks()) {
              try { tr.stop(); } catch {}
            }
          }
          return { ok: false, cancelled: true };
        }
        const tracks = typeof candidate?.getAudioTracks === 'function' ? candidate.getAudioTracks() : [];
        if (tracks.length > 0 && tracks.some(tr => tr.readyState !== 'ended')) {
          return { ok: true, stream: candidate, tracks };
        }
        if (candidate && typeof candidate.getTracks === 'function') {
          for (const tr of candidate.getTracks()) {
            try { tr.stop(); } catch {}
          }
        }
        lastErr = { name: 'NotReadableError' };
      } catch (err) {
        lastErr = err;
        const errName = String(err?.name || err?.code || '');
        if (/NotAllowedError|PermissionDeniedError|SecurityError/i.test(errName)) {
          break;
        }
      }
    }
    return { ok: false, error: lastErr };
  }

  async function ensureWebSession(mySession, onStreamLost) {
    if (onStreamLost) sessionLossCallback = onStreamLost;

    const activeTracks = stream && typeof stream.getAudioTracks === 'function'
      ? stream.getAudioTracks().filter(tr => tr.readyState !== 'ended')
      : [];

    if (stream && activeTracks.length > 0 && audioCtx && audioCtx.state !== 'closed' && analyser) {
      if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        await Promise.race([
          Promise.resolve(audioCtx.resume()).catch(() => {}),
          new Promise(r => setTimeoutFn(r, 400))
        ]);
      }
      activeBackend = 'web';
      return { ok: true };
    }

    teardownWebStreamOnly();

    // Unlock/create AudioContext synchronously before awaiting getUserMedia so iOS/WebKit preserves user activation
    let ctx = audioCtx && audioCtx.state !== 'closed' ? audioCtx : null;
    if (!ctx) {
      try {
        ctx = new AudioContextClass();
        audioCtx = ctx;
      } catch (err) {
        return { ok: false, ...classifyMediaError(err, t) };
      }
    }
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try {
        Promise.resolve(ctx.resume()).catch(() => {});
      } catch {}
    }

    const acquired = await acquireWebStreamWithFallback(mySession);
    if (acquired.cancelled || mySession !== sessionToken) {
      return { ok: false, code: 'cancelled', message: '' };
    }
    if (!acquired.ok) {
      release();
      return { ok: false, ...classifyMediaError(acquired.error, t) };
    }

    const acquiredStream = acquired.stream;
    const tracks = acquired.tracks;

    try {
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        await Promise.race([
          Promise.resolve(ctx.resume()).catch(() => {}),
          new Promise(r => setTimeoutFn(r, 500))
        ]);
      }
      const src = ctx.createMediaStreamSource(acquiredStream);
      const node = ctx.createAnalyser();
      node.fftSize = 1024;
      node.smoothingTimeConstant = 0.25;
      src.connect(node);

      let zeroGain = null;
      if (typeof ctx.createGain === 'function' && ctx.destination && typeof node.connect === 'function') {
        try {
          zeroGain = ctx.createGain();
          if (zeroGain?.gain) zeroGain.gain.value = 0;
          node.connect(zeroGain);
          zeroGain.connect(ctx.destination);
        } catch {
          zeroGain = null;
        }
      }

      stream = acquiredStream;
      audioCtx = ctx;
      sourceNode = src;
      analyser = node;
      silentGain = zeroGain;
      floatBuf = typeof Float32Array === 'function' ? new Float32Array(node.fftSize) : null;
      byteBuf = typeof Uint8Array === 'function' ? new Uint8Array(node.fftSize) : null;
      setTracksEnabled(false);

      detachTrackListeners();
      for (const track of tracks) {
        if (typeof track.addEventListener === 'function') {
          const handler = () => {
            if (mySession !== sessionToken) return;
            if (!isListeningTurn) {
              // Idle track interrupted during TTS narration: clean up stream so user's next turn re-acquires seamlessly
              teardownWebStreamOnly();
              return;
            }
            const cb = sessionLossCallback;
            release();
            cb?.({
              code: 'stream-lost',
              message: t('O microfone foi desconectado ou interrompido. Continuando no modo Manual.')
            });
          };
          track.addEventListener('ended', handler);
          trackEndedListeners.push({ track, handler });
        }
      }
      activeBackend = 'web';
      return { ok: true };
    } catch (err) {
      if (acquiredStream && typeof acquiredStream.getTracks === 'function') {
        for (const tr of acquiredStream.getTracks()) {
          try { tr.stop(); } catch {}
        }
      }
      release();
      return { ok: false, ...classifyMediaError(err, t) };
    }
  }

  async function ensureSession({ onStreamLost } = {}) {
    if (!isSupported()) {
      return {
        ok: false,
        code: 'unsupported',
        message: t('Este navegador não oferece suporte local à detecção por microfone. Continuando no modo Manual.')
      };
    }

    const mySession = (activeBackend && (nativeReady || stream)) ? sessionToken : ++sessionToken;

    if (hasNativeMic() && activeBackend !== 'web') {
      const nativeRes = await ensureNativeSession(mySession, onStreamLost);
      if (nativeRes.ok || nativeRes.code === 'cancelled' || nativeRes.code === 'permission-denied') {
        return nativeRes;
      }
      if (!hasWebMic()) {
        return nativeRes;
      }
    }

    if (hasWebMic()) {
      return ensureWebSession(mySession, onStreamLost);
    }

    return {
      ok: false,
      code: 'unsupported',
      message: t('Este navegador não oferece suporte local à detecção por microfone. Continuando no modo Manual.')
    };
  }

  async function startListeningTurn({
    silenceSeconds = 3,
    onStateChange,
    onSpeechComplete,
    onError
  } = {}) {
    stopListening();
    const prep = await ensureSession({
      onStreamLost: err => onError?.(err)
    });
    if (!prep.ok) {
      if (prep.code !== 'cancelled') {
        onError?.(prep);
      }
      return { started: false, reason: prep.code };
    }

    const myTurn = ++turnToken;
    const silenceTargetMs = ([2, 3, 5].includes(Number(silenceSeconds)) ? Number(silenceSeconds) : 3) * 1000;

    if (activeBackend === 'native') {
      const startRes = parseJsonSafe(nativeBridge.startMicMonitor());
      if (!startRes?.ok) {
        if (startRes?.code !== 'permission-denied' && hasWebMic()) {
          nativeReady = false;
          activeBackend = 'web';
          const webPrep = await ensureWebSession(sessionToken, err => onError?.(err));
          if (!webPrep.ok) {
            if (webPrep.code !== 'cancelled') onError?.(webPrep);
            return { started: false, reason: webPrep.code };
          }
        } else {
          const mapped = classifyMediaError({ code: startRes?.code || 'mic-busy' }, t);
          release();
          onError?.(mapped);
          return { started: false, reason: mapped.code };
        }
      }
    }

    if (activeBackend === 'web') {
      setTracksEnabled(true);
      if (audioCtx && audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        try { Promise.resolve(audioCtx.resume()).catch(() => {}); } catch {}
      }
    }

    isListeningTurn = true;
    let lastTickAt = now();
    let lastEmitAt = 0;
    let elapsedCalibrationMs = 0;
    let calibrationSum = 0;
    let calibrationCount = 0;
    let noiseFloor = 0.006;
    let hasStartedSpeaking = false;
    let activeSpeechStreakMs = 0;
    let silenceStreakMs = 0;
    let lastPhase = 'calibrating';

    const emitStatus = (phase, level, force = false) => {
      const currentAt = now();
      if (!force && phase === lastPhase && currentAt - lastEmitAt < UI_EMIT_INTERVAL_MS) return;
      lastPhase = phase;
      lastEmitAt = currentAt;
      onStateChange?.({
        phase,
        hasStartedSpeaking,
        level: Math.max(0, Math.min(1, level)),
        silenceRemainingMs: hasStartedSpeaking ? Math.max(0, silenceTargetMs - silenceStreakMs) : silenceTargetMs,
        silenceTargetMs
      });
    };

    emitStatus('waiting-voice', 0, true);

    const sampleOnce = () => {
      if (myTurn !== turnToken || !isListeningTurn) return;
      const currentAt = now();
      const dt = Math.max(10, Math.min(250, currentAt - lastTickAt || SAMPLE_INTERVAL_MS));
      lastTickAt = currentAt;

      let rms = 0;
      if (activeBackend === 'native') {
        const pollRes = parseJsonSafe(nativeBridge.pollMicMonitor());
        if (!pollRes?.ok) {
          if (myTurn !== turnToken || pollRes?.code === 'stopped') return;
          release();
          onError?.({
            code: 'stream-lost',
            message: t('O microfone foi desconectado ou interrompido. Continuando no modo Manual.')
          });
          return;
        }
        rms = Number(pollRes.rms) || 0;
      } else {
        if (!analyser) return;
        try {
          rms = computeRms(analyser, floatBuf, byteBuf);
        } catch {
          release();
          onError?.({
            code: 'audio-error',
            message: t('Falha na leitura local de áudio. Continuando no modo Manual.')
          });
          return;
        }
      }

      if (elapsedCalibrationMs < CALIBRATION_MS && !hasStartedSpeaking) {
        elapsedCalibrationMs += dt;
        // Clamp initial samples so speaking immediately on turn start never inflates noiseFloor above speech
        calibrationSum += Math.min(rms, 0.015);
        calibrationCount += 1;
        noiseFloor = Math.max(0.0025, Math.min(0.015, calibrationSum / calibrationCount));
      }

      const onsetThreshold = Math.max(0.014, Math.min(0.12, noiseFloor * 2.8 + 0.006));
      const sustainThreshold = Math.max(0.009, onsetThreshold * 0.6);
      const normalizedLevel = Math.min(1, rms / Math.max(0.035, onsetThreshold * 2.2));

      if (!hasStartedSpeaking) {
        if (rms >= onsetThreshold) {
          activeSpeechStreakMs += dt;
          if (activeSpeechStreakMs >= SPEECH_ONSET_CONFIRM_MS) {
            hasStartedSpeaking = true;
            silenceStreakMs = 0;
            emitStatus('speaking', normalizedLevel, true);
          } else {
            emitStatus('waiting-voice', normalizedLevel, false);
          }
        } else {
          // Decay partial noise spikes so isolated clicks never accumulate into speech onset
          activeSpeechStreakMs = Math.max(0, activeSpeechStreakMs - dt * 1.5);
          if (rms < onsetThreshold * 0.85) {
            noiseFloor = Math.max(0.0025, Math.min(0.04, noiseFloor * 0.96 + rms * 0.04));
          }
          emitStatus('waiting-voice', normalizedLevel, false);
        }
        return;
      }

      // User has already confirmed speech onset in this turn
      if (rms >= sustainThreshold) {
        activeSpeechStreakMs += dt;
        if (activeSpeechStreakMs >= SPEECH_RESUME_CONFIRM_MS) {
          silenceStreakMs = 0;
          emitStatus('speaking', normalizedLevel, lastPhase !== 'speaking');
        } else {
          emitStatus('speaking', normalizedLevel, false);
        }
      } else {
        activeSpeechStreakMs = 0;
        silenceStreakMs += dt;
        if (silenceStreakMs >= silenceTargetMs) {
          stopListening();
          onSpeechComplete?.();
          return;
        }
        emitStatus('silence-countdown', normalizedLevel, lastPhase !== 'silence-countdown');
      }
    };

    timerId = setIntervalFn(sampleOnce, SAMPLE_INTERVAL_MS);
    return { started: true, sampleOnce };
  }

  return {
    isSupported,
    ensureSession,
    startListeningTurn,
    stopListening,
    release,
    isActive: () => nativeReady || stream !== null
  };
}
