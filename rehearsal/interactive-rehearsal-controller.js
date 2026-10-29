import {
  REHEARSAL_STATES,
  SILENCE_OPTIONS,
  buildRehearsalPlan,
  computeProgressiveHint
} from './interactive-rehearsal-core.js';
import {
  loadRehearsalPreferences,
  saveRehearsalPreferences
} from './interactive-rehearsal-audio.js';

export function createRehearsalController({
  audio,
  vad,
  timer = {},
  t = s => s,
  onChange,
  onTurnChange,
  onVadChange,
  onNotice,
  onComplete
} = {}) {
  let state = 'idle';
  let sessionId = 0;
  let epoch = 0;
  let inTransition = false;

  let activeSpeechId = '';
  let activeSpeechTitle = '';
  let plan = null;
  let activeMode = 'manual';
  let silenceSeconds = 3;
  let hideMyLines = false;
  let showHints = true;

  let currentTurnIndex = 0;
  let narrationCharOffset = 0;
  let hintLevel = 0;
  let blockedPlayback = null;
  let vadStatus = null;
  let fallbackNotice = '';
  let errorInfo = null;
  let completedSaved = false;

  if (audio && typeof audio.onExternalInterrupt === 'function') {
    audio.onExternalInterrupt(() => {
      if (['narrating', 'waiting-user', 'listening', 'preparing'].includes(state)) {
        pause({ externalAudio: true });
      }
    });
  }

  function currentTurn() {
    if (!plan || !Array.isArray(plan.turns)) return null;
    return plan.turns[currentTurnIndex] || null;
  }

  function snapshot() {
    const turn = currentTurn();
    const hint = turn && turn.isUser
      ? computeProgressiveHint(turn.spokenText, hintLevel)
      : { level: 0, maxLevel: 3, text: '', complete: false };
    return {
      state,
      isActive: state !== 'idle',
      isRunning: ['preparing', 'narrating', 'waiting-user', 'listening'].includes(state),
      mode: activeMode,
      silenceSeconds,
      hideMyLines,
      showHints,
      speechId: activeSpeechId,
      speechTitle: activeSpeechTitle,
      versionId: plan?.versionId || '',
      versionName: plan?.versionName || '',
      contentKey: plan?.contentKey || '',
      plan,
      currentTurnIndex,
      totalTurns: plan?.turns?.length || 0,
      currentTurn: turn,
      narrationCharOffset,
      hintLevel,
      currentHint: hint,
      blockedPlayback,
      vadStatus,
      fallbackNotice,
      error: errorInfo,
      completedSaved
    };
  }

  function emit() {
    onChange?.(snapshot());
  }

  function setState(nextState) {
    if (!REHEARSAL_STATES.includes(nextState)) {
      throw new Error(`Invalid rehearsal state: ${nextState}`);
    }
    state = nextState;
  }

  function cleanupMedia() {
    audio?.cancel?.();
    vad?.release?.();
    vadStatus = null;
  }

  async function start({
    speech,
    mode,
    silenceSeconds: requestedSilence,
    hideMyLines: requestedHide,
    showHints: requestedHints
  } = {}) {
    const prefs = loadRehearsalPreferences();
    const chosenMode = mode === 'auto' ? 'auto' : mode === 'manual' ? 'manual' : prefs.mode;
    const chosenSilence = SILENCE_OPTIONS.includes(Number(requestedSilence))
      ? Number(requestedSilence)
      : prefs.silenceSeconds;
    const chosenHide = requestedHide !== undefined ? Boolean(requestedHide) : prefs.hideMyLines;
    const chosenHints = requestedHints !== undefined ? Boolean(requestedHints) : prefs.showHints;

    saveRehearsalPreferences({
      mode: chosenMode,
      silenceSeconds: chosenSilence,
      hideMyLines: chosenHide,
      showHints: chosenHints
    });

    cleanupMedia();
    const nextPlan = buildRehearsalPlan(speech, { bypassCache: true });
    activeSpeechId = String(speech?.id || '');
    activeSpeechTitle = String(speech?.title || '');
    plan = nextPlan;
    activeMode = chosenMode;
    silenceSeconds = chosenSilence;
    hideMyLines = chosenHide;
    showHints = chosenHints;
    currentTurnIndex = 0;
    narrationCharOffset = 0;
    hintLevel = 0;
    blockedPlayback = null;
    fallbackNotice = '';
    errorInfo = null;
    completedSaved = false;

    if (!nextPlan.valid) {
      sessionId += 1;
      epoch += 1;
      setState('error');
      errorInfo = {
        code: nextPlan.reason,
        message: describeInvalidReason(nextPlan.reason, t)
      };
      emit();
      return { ok: false, reason: nextPlan.reason, plan: nextPlan };
    }

    const mySession = ++sessionId;
    const myEpoch = ++epoch;
    setState('preparing');
    emit();

    if (activeMode === 'auto') {
      if (!vad) {
        activeMode = 'manual';
        fallbackNotice = t('Detecção de voz indisponível. Continuando no modo Manual.');
        onNotice?.(fallbackNotice);
      } else {
        const res = await vad.ensureSession({
          onStreamLost: err => handleVadFailure(mySession, err)
        });
        if (mySession !== sessionId || myEpoch !== epoch) {
          vad.release?.();
          return { ok: false, reason: 'cancelled', plan: nextPlan };
        }
        if (!res.ok) {
          activeMode = 'manual';
          fallbackNotice = res.message || t('Microfone indisponível. Continuando no modo Manual.');
          onNotice?.(fallbackNotice);
        }
      }
    }

    timer?.ensureRunning?.();
    await enterTurn(0, { resetHint: true, resumeOffset: 0, notifyTurn: true });
    return { ok: true, plan: nextPlan, mode: activeMode };
  }

  function handleVadFailure(expectedSession, err) {
    if (expectedSession !== sessionId || state === 'idle' || state === 'completed') return;
    vad?.release?.();
    activeMode = 'manual';
    vadStatus = null;
    fallbackNotice = err?.message || t('O microfone não está mais disponível. Continuando no modo Manual.');
    onNotice?.(fallbackNotice);
    if (state === 'listening') {
      epoch += 1;
      setState('waiting-user');
      emit();
    } else {
      emit();
    }
  }

  async function enterTurn(index, { resetHint = true, resumeOffset = 0, notifyTurn = true } = {}) {
    if (!plan || !plan.valid || inTransition) return;
    inTransition = true;
    const mySession = sessionId;
    const myEpoch = ++epoch;

    try {
      audio?.cancel?.();
      vad?.stopListening?.();
      vadStatus = null;
      blockedPlayback = null;
      errorInfo = null;

      if (index >= plan.turns.length) {
        currentTurnIndex = Math.max(0, plan.turns.length - 1);
        narrationCharOffset = 0;
        vad?.release?.();
        setState('completed');
        timer?.pauseIfRunning?.();
        inTransition = false;
        emit();
        onComplete?.(snapshot());
        return;
      }

      const clampedIndex = Math.max(0, Math.min(index, plan.turns.length - 1));
      const changedTurn = clampedIndex !== currentTurnIndex;
      currentTurnIndex = clampedIndex;
      narrationCharOffset = Math.max(0, Number(resumeOffset) || 0);
      if (resetHint || changedTurn) hintLevel = 0;

      const turn = plan.turns[currentTurnIndex];

      if (!turn.isUser) {
        setState('narrating');
        inTransition = false;
        if (notifyTurn || changedTurn) onTurnChange?.(snapshot());
        emit();

        audio?.speakTurn?.({
          turn,
          participants: plan.participants,
          speechId: activeSpeechId,
          title: `${turn.participantName} · ${activeSpeechTitle || t('Ensaio interativo')}`,
          offset: narrationCharOffset,
          onStart: () => {
            if (mySession !== sessionId || myEpoch !== epoch || state !== 'narrating') return;
          },
          onBoundary: ({ offset }) => {
            if (mySession !== sessionId || myEpoch !== epoch || state !== 'narrating') return;
            narrationCharOffset = Math.max(0, Number(offset) || 0);
          },
          onEnd: () => {
            if (mySession !== sessionId || myEpoch !== epoch || state !== 'narrating') return;
            narrationCharOffset = 0;
            void enterTurn(currentTurnIndex + 1, { resetHint: true, resumeOffset: 0, notifyTurn: true });
          },
          onPaused: () => {
            if (mySession !== sessionId || myEpoch !== epoch || state !== 'narrating') return;
            pause({ fromAudio: true });
          },
          onBlocked: info => {
            if (mySession !== sessionId || myEpoch !== epoch) return;
            blockedPlayback = {
              code: info?.code || 'not-allowed',
              message:
                info?.message ||
                t('Toque em Reproduzir fala para autorizar o áudio neste dispositivo.')
            };
            timer?.pauseIfRunning?.();
            setState('paused');
            emit();
          },
          onError: err => {
            if (mySession !== sessionId || myEpoch !== epoch) return;
            errorInfo = {
              code: err?.code || 'synthesis-failed',
              message: err?.message || t('Não foi possível reproduzir esta fala.')
            };
            timer?.pauseIfRunning?.();
            setState('error');
            emit();
          }
        });
        return;
      }

      // User's turn
      narrationCharOffset = 0;
      if (activeMode === 'manual') {
        setState('waiting-user');
        inTransition = false;
        if (notifyTurn || changedTurn) onTurnChange?.(snapshot());
        emit();
        return;
      }

      // Automatic mode on user's turn
      setState('listening');
      vadStatus = {
        phase: 'waiting-voice',
        hasStartedSpeaking: false,
        level: 0,
        silenceRemainingMs: silenceSeconds * 1000,
        silenceTargetMs: silenceSeconds * 1000
      };
      inTransition = false;
      if (notifyTurn || changedTurn) onTurnChange?.(snapshot());
      emit();

      if (!vad) {
        handleVadFailure(mySession, {
          code: 'unsupported',
          message: t('Microfone indisponível. Continuando no modo Manual.')
        });
        return;
      }

      const listenResult = await vad.startListeningTurn({
        silenceSeconds,
        onStateChange: status => {
          if (mySession !== sessionId || myEpoch !== epoch || state !== 'listening') return;
          vadStatus = status;
          onVadChange?.(status, snapshot());
        },
        onSpeechComplete: () => {
          if (mySession !== sessionId || myEpoch !== epoch || state !== 'listening') return;
          vadStatus = null;
          void enterTurn(currentTurnIndex + 1, { resetHint: true, resumeOffset: 0, notifyTurn: true });
        },
        onError: err => {
          if (mySession !== sessionId || myEpoch !== epoch) return;
          handleVadFailure(mySession, err);
        }
      });

      if (!listenResult?.started && mySession === sessionId && myEpoch === epoch && state === 'listening') {
        handleVadFailure(mySession, {
          code: listenResult?.reason || 'audio-error',
          message: t('Não foi possível ativar o microfone. Continuando no modo Manual.')
        });
      }
    } finally {
      inTransition = false;
    }
  }

  function finishUserTurn() {
    if (!['waiting-user', 'listening'].includes(state)) return false;
    vad?.stopListening?.();
    vadStatus = null;
    void enterTurn(currentTurnIndex + 1, { resetHint: true, resumeOffset: 0, notifyTurn: true });
    return true;
  }

  function pause({ externalAudio = false, fromAudio = false } = {}) {
    if (!['preparing', 'narrating', 'waiting-user', 'listening'].includes(state)) return false;
    epoch += 1;
    if (!fromAudio) audio?.cancel?.();
    // Release mic immediately when paused so capture never stays open unnecessarily
    vad?.release?.();
    vadStatus = null;
    if (!externalAudio) {
      timer?.pauseIfRunning?.();
    }
    setState('paused');
    emit();
    return true;
  }

  async function resume() {
    if (!['paused', 'error'].includes(state) || !plan || !plan.valid) return false;
    const mySession = sessionId;
    blockedPlayback = null;
    errorInfo = null;

    if (activeMode === 'auto' && vad) {
      const res = await vad.ensureSession({
        onStreamLost: err => handleVadFailure(mySession, err)
      });
      if (mySession !== sessionId) return false;
      if (!res.ok) {
        activeMode = 'manual';
        fallbackNotice = res.message || t('Microfone indisponível. Continuando no modo Manual.');
        onNotice?.(fallbackNotice);
      }
    }

    timer?.ensureRunning?.();
    await enterTurn(currentTurnIndex, {
      resetHint: false,
      resumeOffset: narrationCharOffset,
      notifyTurn: false
    });
    return true;
  }

  function previousTurn() {
    if (!plan || !plan.valid || state === 'idle') return false;
    const target = state === 'completed'
      ? Math.max(0, plan.turns.length - 1)
      : Math.max(0, currentTurnIndex - 1);
    narrationCharOffset = 0;
    hintLevel = 0;
    if (state === 'paused') {
      currentTurnIndex = target;
      blockedPlayback = null;
      errorInfo = null;
      onTurnChange?.(snapshot());
      emit();
      return true;
    }
    if (state === 'completed') {
      timer?.ensureRunning?.();
    }
    void enterTurn(target, { resetHint: true, resumeOffset: 0, notifyTurn: true });
    return true;
  }

  function repeatLastTurn() {
    if (!plan || !plan.valid || state === 'idle') return false;
    const turn = currentTurn();
    // If on user's turn and the immediately preceding turn was spoken by another participant,
    // replay that partner's line so it naturally flows back into the user's turn.
    let target = currentTurnIndex;
    if (turn?.isUser && currentTurnIndex > 0 && !plan.turns[currentTurnIndex - 1].isUser) {
      target = currentTurnIndex - 1;
    }
    narrationCharOffset = 0;
    if (state === 'paused' || state === 'completed' || state === 'error') {
      timer?.ensureRunning?.();
    }
    void enterTurn(target, { resetHint: target !== currentTurnIndex, resumeOffset: 0, notifyTurn: true });
    return true;
  }

  function skipTurn() {
    if (!plan || !plan.valid || ['idle', 'completed'].includes(state)) return false;
    narrationCharOffset = 0;
    hintLevel = 0;
    if (state === 'paused') {
      if (currentTurnIndex + 1 >= plan.turns.length) {
        void enterTurn(plan.turns.length, { resetHint: true });
      } else {
        currentTurnIndex += 1;
        blockedPlayback = null;
        errorInfo = null;
        onTurnChange?.(snapshot());
        emit();
      }
      return true;
    }
    void enterTurn(currentTurnIndex + 1, { resetHint: true, resumeOffset: 0, notifyTurn: true });
    return true;
  }

  function revealHint() {
    const turn = currentTurn();
    if (!turn || !turn.isUser || state === 'idle') return null;
    hintLevel = Math.min(3, hintLevel + 1);
    emit();
    return computeProgressiveHint(turn.spokenText, hintLevel);
  }

  function setHideMyLines(value) {
    hideMyLines = Boolean(value);
    saveRehearsalPreferences({ hideMyLines });
    if (state !== 'idle') emit();
  }

  function setShowHints(value) {
    showHints = Boolean(value);
    saveRehearsalPreferences({ showHints });
    if (state !== 'idle') emit();
  }

  function setSilenceSeconds(value) {
    if (!SILENCE_OPTIONS.includes(Number(value))) return;
    silenceSeconds = Number(value);
    saveRehearsalPreferences({ silenceSeconds });
    if (state === 'listening') {
      void enterTurn(currentTurnIndex, { resetHint: false, resumeOffset: 0, notifyTurn: false });
    } else if (state !== 'idle') {
      emit();
    }
  }

  async function switchMode(nextMode) {
    const normalized = nextMode === 'auto' ? 'auto' : 'manual';
    if (normalized === activeMode && state !== 'error') return true;
    saveRehearsalPreferences({ mode: normalized });

    if (normalized === 'manual') {
      vad?.release?.();
      vadStatus = null;
      activeMode = 'manual';
      fallbackNotice = '';
      if (state === 'listening') {
        epoch += 1;
        setState('waiting-user');
      }
      emit();
      return true;
    }

    // Switch to automatic mode
    const mySession = sessionId;
    activeMode = 'auto';
    if (state === 'idle') return true;

    if (!vad) {
      activeMode = 'manual';
      fallbackNotice = t('Microfone indisponível neste dispositivo. Mantendo modo Manual.');
      onNotice?.(fallbackNotice);
      emit();
      return false;
    }

    const res = await vad.ensureSession({
      onStreamLost: err => handleVadFailure(mySession, err)
    });
    if (mySession !== sessionId) return false;
    if (!res.ok) {
      activeMode = 'manual';
      fallbackNotice = res.message || t('Microfone indisponível. Continuando no modo Manual.');
      onNotice?.(fallbackNotice);
      emit();
      return false;
    }
    fallbackNotice = '';
    if (state === 'waiting-user') {
      await enterTurn(currentTurnIndex, { resetHint: false, resumeOffset: 0, notifyTurn: false });
    } else {
      emit();
    }
    return true;
  }

  function markCompletedSaved() {
    completedSaved = true;
    if (state !== 'idle') emit();
  }

  function stop({ pauseTimer = true } = {}) {
    if (state === 'idle') {
      cleanupMedia();
      return;
    }
    const wasRunning = ['preparing', 'narrating', 'waiting-user', 'listening'].includes(state);
    sessionId += 1;
    epoch += 1;
    cleanupMedia();
    if (pauseTimer && wasRunning) {
      timer?.pauseIfRunning?.();
    }
    plan = null;
    currentTurnIndex = 0;
    narrationCharOffset = 0;
    hintLevel = 0;
    blockedPlayback = null;
    fallbackNotice = '';
    errorInfo = null;
    completedSaved = false;
    setState('idle');
    emit();
  }

  function syncTimerState(timerRunning) {
    if (state === 'idle' || state === 'completed') return;
    if (!timerRunning && ['narrating', 'waiting-user', 'listening'].includes(state)) {
      pause({ externalAudio: true });
    } else if (timerRunning && state === 'paused' && !blockedPlayback) {
      void resume();
    }
  }

  return {
    getSnapshot: snapshot,
    isActive: () => state !== 'idle',
    start,
    finishUserTurn,
    pause,
    resume,
    previousTurn,
    repeatLastTurn,
    skipTurn,
    revealHint,
    setHideMyLines,
    setShowHints,
    setSilenceSeconds,
    switchMode,
    markCompletedSaved,
    syncTimerState,
    stop
  };
}

function describeInvalidReason(reason, t) {
  switch (reason) {
    case 'not-part':
      return t('O Ensaio interativo está disponível apenas para demonstrações com participantes.');
    case 'need-two-participants':
      return t('Adicione pelo menos dois participantes à demonstração para iniciar o Ensaio interativo.');
    case 'all-unassigned':
      return t('Identifique quem fala nos trechos do documento antes de iniciar o ensaio.');
    case 'empty-turns':
      return t('Escreva as falas dos participantes antes de iniciar o ensaio.');
    case 'missing-identity':
      return t('Selecione sua identidade em "Quem sou eu" para iniciar o ensaio.');
    default:
      return t('Não foi possível preparar as falas desta demonstração.');
  }
}
