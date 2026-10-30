// This gate receives classifier probabilities, never microphone loudness.
// Native frames contain exactly 32 ms of captured audio, consumed once.
export function createClassifiedSpeechGate({ silenceTargetMs = 3000 } = {}) {
  let started = false;
  let confirmedRun = false;
  let runMs = 0;
  let gapMs = 0;
  let silenceMs = 0;
  let complete = false;

  function push({ probability, dt = 32 } = {}) {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1 ||
        !Number.isFinite(dt) || dt <= 0 || dt > 64) {
      throw new Error('Invalid classified audio frame');
    }
    if (!complete) {
      // Hysteresis only within a confirmed utterance; a new utterance requires >= .65.
      const speech = probability >= (confirmedRun ? 0.45 : 0.65);
      if (speech) {
        gapMs = 0;
        runMs += dt;
        if (runMs >= 160) {
          started = true;
          confirmedRun = true;
          silenceMs = 0;
        } else if (started) {
          // Isolated detections do not freeze or reset the countdown.
          silenceMs += dt;
        }
      } else {
        gapMs += dt;
        // Permit brief syllable gaps without accumulating isolated noise bursts.
        if (gapMs > 64) {
          runMs = 0;
          confirmedRun = false;
        }
        if (started) silenceMs += dt;
      }
      // Hold at deadline for at most 128 ms if new speech is being confirmed.
      complete = started && silenceMs >= silenceTargetMs && (!speech || confirmedRun);
    }
    return {
      hasStartedSpeaking: started,
      phase: complete ? 'complete' : !started ? 'waiting-voice' : silenceMs > 0 ? 'silence-countdown' : 'speaking',
      silenceStreakMs: silenceMs,
      complete,
      level: probability
    };
  }
  return { push };
}
