const SAMPLE_INTERVAL_MS = 60;
const UI_EMIT_INTERVAL_MS = 180;
const CALIBRATION_MS = 240;
const SPEECH_ONSET_CONFIRM_MS = 240;
const SPEECH_RESUME_CONFIRM_MS = 120;

function computeRms(analyser, floatBuf, byteBuf) {
  if (typeof analyser.getFloatTimeDomainData === 'function' && floatBuf) {
    analyser.getFloatTimeDomainData(floatBuf);
    let sum = 0;
    for (let i = 0; i < floatBuf.length; i += 1) {
      const s = floatBuf[i];
      sum += s * s;
    }
    return Math.sqrt(sum / Math.max(1, floatBuf.length));
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
  if (/NotAllowedError|PermissionDeniedError|SecurityError/i.test(name)) {
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
  if (/NotReadableError|TrackStartError|AbortError/i.test(name)) {
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

export function createRehearsalVad({
  mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : null,
  AudioContextClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null,
  now = () => Date.now(),
  setIntervalFn = (fn, ms) => setInterval(fn, ms),
  clearIntervalFn = id => clearInterval(id),
  t = s => s
} = {}) {
  let sessionToken = 0;
  let turnToken = 0;
  let stream = null;
  let audioCtx = null;
  let sourceNode = null;
  let analyser = null;
  let floatBuf = null;
  let byteBuf = null;
  let timerId = null;
  let trackEndedListeners = [];

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

  function stopListening() {
    turnToken += 1;
    clearTimer();
    setTracksEnabled(false);
  }

  function release() {
    sessionToken += 1;
    stopListening();
    detachTrackListeners();
    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch {}
      sourceNode = null;
    }
    if (analyser) {
      try {
        analyser.disconnect();
      } catch {}
      analyser = null;
    }
    if (stream && typeof stream.getTracks === 'function') {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {}
      }
    }
    stream = null;
    floatBuf = null;
    byteBuf = null;
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
    return Boolean(
      mediaDevices &&
      typeof mediaDevices.getUserMedia === 'function' &&
      typeof AudioContextClass === 'function'
    );
  }

  async function ensureSession({ onStreamLost } = {}) {
    if (!isSupported()) {
      return {
        ok: false,
        code: 'unsupported',
        message: t('Este navegador não oferece suporte local à detecção por microfone. Continuando no modo Manual.')
      };
    }

    const activeTracks = stream && typeof stream.getAudioTracks === 'function'
      ? stream.getAudioTracks().filter(tr => tr.readyState !== 'ended')
      : [];

    if (stream && activeTracks.length > 0 && audioCtx && audioCtx.state !== 'closed') {
      try {
        if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
          await audioCtx.resume();
        }
        return { ok: true };
      } catch (err) {
        release();
      }
    } else if (stream || audioCtx) {
      release();
    }

    const mySession = ++sessionToken;
    let acquiredStream = null;
    try {
      acquiredStream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
    } catch (err) {
      return { ok: false, ...classifyMediaError(err, t) };
    }

    if (mySession !== sessionToken) {
      if (acquiredStream && typeof acquiredStream.getTracks === 'function') {
        for (const tr of acquiredStream.getTracks()) {
          try { tr.stop(); } catch {}
        }
      }
      return { ok: false, code: 'cancelled', message: '' };
    }

    const tracks = typeof acquiredStream?.getAudioTracks === 'function' ? acquiredStream.getAudioTracks() : [];
    if (!tracks.length || tracks.every(tr => tr.readyState === 'ended')) {
      if (acquiredStream && typeof acquiredStream.getTracks === 'function') {
        for (const tr of acquiredStream.getTracks()) {
          try { tr.stop(); } catch {}
        }
      }
      return {
        ok: false,
        code: 'mic-unavailable',
        message: t('O microfone não entregou sinal de áudio. Continuando no modo Manual.')
      };
    }

    try {
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        await ctx.resume();
      }
      const src = ctx.createMediaStreamSource(acquiredStream);
      const node = ctx.createAnalyser();
      node.fftSize = 1024;
      node.smoothingTimeConstant = 0.25;
      src.connect(node);

      stream = acquiredStream;
      audioCtx = ctx;
      sourceNode = src;
      analyser = node;
      floatBuf = typeof Float32Array === 'function' ? new Float32Array(node.fftSize) : null;
      byteBuf = typeof Uint8Array === 'function' ? new Uint8Array(node.fftSize) : null;
      setTracksEnabled(false);

      detachTrackListeners();
      for (const track of tracks) {
        if (typeof track.addEventListener === 'function') {
          const handler = () => {
            if (mySession !== sessionToken) return;
            release();
            onStreamLost?.({
              code: 'stream-lost',
              message: t('O microfone foi desconectado ou interrompido. Continuando no modo Manual.')
            });
          };
          track.addEventListener('ended', handler);
          trackEndedListeners.push({ track, handler });
        }
      }
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

    setTracksEnabled(true);

    let lastTickAt = now();
    let lastEmitAt = 0;
    let elapsedCalibrationMs = 0;
    let calibrationSum = 0;
    let calibrationCount = 0;
    let noiseFloor = 0.008;
    let hasStartedSpeaking = false;
    let activeSpeechStreakMs = 0;
    let silenceStreakMs = 0;
    let lastPhase = 'calibrating'; // 'calibrating' | 'waiting-voice' | 'speaking' | 'silence-countdown'

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
      if (myTurn !== turnToken || !analyser) return;
      const currentAt = now();
      const dt = Math.max(10, Math.min(250, currentAt - lastTickAt || SAMPLE_INTERVAL_MS));
      lastTickAt = currentAt;

      let rms = 0;
      try {
        rms = computeRms(analyser, floatBuf, byteBuf);
      } catch (err) {
        release();
        onError?.({
          code: 'audio-error',
          message: t('Falha na leitura local de áudio. Continuando no modo Manual.')
        });
        return;
      }

      if (elapsedCalibrationMs < CALIBRATION_MS && !hasStartedSpeaking) {
        elapsedCalibrationMs += dt;
        // Clamp loud initial bursts so speaking immediately doesn't inflate noiseFloor
        calibrationSum += Math.min(rms, 0.035);
        calibrationCount += 1;
        noiseFloor = Math.max(0.003, Math.min(0.035, calibrationSum / calibrationCount));
      }

      const onsetThreshold = Math.max(0.022, Math.min(0.12, noiseFloor * 2.8 + 0.01));
      const sustainThreshold = Math.max(0.014, onsetThreshold * 0.62);
      const normalizedLevel = Math.min(1, rms / Math.max(0.04, onsetThreshold * 2.2));

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
            noiseFloor = Math.max(0.003, Math.min(0.04, noiseFloor * 0.96 + rms * 0.04));
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
    isActive: () => stream !== null
  };
}
