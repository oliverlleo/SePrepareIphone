import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newSpeech, newPart, normalizeVersions, createContentVersion, selectContentVersion } from '../sharing/core.js';
import { rhythmValue } from '../timing/rhythm-core.js';
import {
  canOfferInteractiveRehearsal,
  buildRehearsalPlan,
  computeProgressiveHint,
  cleanSpokenText
} from './interactive-rehearsal-core.js';
import { createRehearsalAudio } from './interactive-rehearsal-audio.js';
import { createRehearsalVad } from './interactive-rehearsal-vad.js';
import { createRehearsalController } from './interactive-rehearsal-controller.js';

const check = name => console.log('OK ' + name);

// 1. Speech (not demonstration) should never offer interactive rehearsal
const speech = newSpeech();
assert.equal(canOfferInteractiveRehearsal(speech), false);
assert.equal(buildRehearsalPlan(speech).valid, false);
assert.equal(buildRehearsalPlan(speech).reason, 'not-part');
check('Discursos comuns não exibem nem habilitam Ensaio interativo');

// 2. Classic 3-participant example using IDs, even if names appear inside text
const part = newPart();
part.participants = [
  { id: 'p-joao', name: 'João' },
  { id: 'p-maria', name: 'Maria' },
  { id: 'p-pedro', name: 'Pedro' }
];
part.myParticipantId = 'p-joao';
part.delta = {
  ops: [
    { insert: 'Bom dia, Maria.\n', attributes: { speaker: 'p-joao', 'speech-time': '15' } },
    { insert: 'Bom dia, João!\n', attributes: { speaker: 'p-maria', 'presenter-note': 'note_1', 'speech-rhythm': rhythmValue({ id: 'calm', name: 'Pausado', ppm: 105 }) } },
    { insert: 'Gostaria de conversar com você, Pedro: veja isto.\n', attributes: { speaker: 'p-joao', 'speech-time-point': '30' } },
    { insert: 'Posso participar também?\n', attributes: { speaker: 'p-pedro', bold: true } }
  ]
};
part.presenterNotes = [{ id: 'note_1', text: 'Sorrir ao cumprimentar', createdAt: 1, updatedAt: 1 }];
normalizeVersions(part);

const beforeDeltaJson = JSON.stringify(part.delta);
const plan = buildRehearsalPlan(part);
assert.equal(plan.valid, true);
assert.equal(plan.turns.length, 4);
assert.deepEqual(
  plan.turns.map(t => ({ pid: t.participantId, role: t.role, text: t.spokenText })),
  [
    { pid: 'p-joao', role: 'user', text: 'Bom dia, Maria.' },
    { pid: 'p-maria', role: 'other', text: 'Bom dia, João!' },
    { pid: 'p-joao', role: 'user', text: 'Gostaria de conversar com você, Pedro: veja isto.' },
    { pid: 'p-pedro', role: 'other', text: 'Posso participar também?' }
  ]
);
assert.equal(JSON.stringify(part.delta), beforeDeltaJson);
assert.equal(plan.turns[1].spokenText.includes('Sorrir'), false);
assert.equal(plan.turns[1].spokenText.includes('Maria:'), false);
assert.equal(plan.turns[0].spokenText.includes('00:15'), false);
check('Plano de turnos identifica IDs de participantes sem alterar o Delta nem narrar notas privadas');

// 3. User as intermediate and last participant
const planAsMaria = buildRehearsalPlan(part, { myParticipantId: 'p-maria' });
assert.deepEqual(planAsMaria.turns.map(t => t.isUser), [false, true, false, false]);
const planAsPedro = buildRehearsalPlan(part, { myParticipantId: 'p-pedro' });
assert.deepEqual(planAsPedro.turns.map(t => t.isUser), [false, false, false, true]);
check('Quem sou eu identifica turnos do usuário no início, meio ou fim');

// 4. Consecutive lines of same participant + page breaks
const paged = newPart();
paged.participants = [{ id: 'u1', name: 'Ana' }, { id: 'u2', name: 'Carlos' }];
paged.myParticipantId = 'u2';
paged.delta = {
  ops: [
    { insert: 'Primeira frase da Ana.\n', attributes: { speaker: 'u1' } },
    { insert: { pagebreak: true } },
    { insert: 'Segunda frase consecutiva da Ana na outra página.\n', attributes: { speaker: 'u1' } },
    { insert: 'Resposta do Carlos.\n', attributes: { speaker: 'u2' } }
  ]
};
normalizeVersions(paged);
const pagedPlan = buildRehearsalPlan(paged);
assert.equal(pagedPlan.valid, true);
assert.equal(pagedPlan.turns.length, 2);
assert.deepEqual(pagedPlan.turns[0].pages, [0, 1]);
check('Trechos consecutivos do mesmo participante agrupam intervenções preservando quebras de página');

// 5. Unassigned text detection without silent misattribution
const withUnassigned = newPart();
withUnassigned.participants = [{ id: 'a', name: 'Lucas' }, { id: 'b', name: 'Sara' }];
withUnassigned.myParticipantId = 'a';
withUnassigned.delta = {
  ops: [
    { insert: 'Trecho esquecido sem participante.\n' },
    { insert: 'Fala do Lucas antes.\n', attributes: { speaker: 'a' } },
    { insert: 'Outro trecho sem dono no meio.\n' },
    { insert: 'Fala do Lucas depois da lacuna.\n', attributes: { speaker: 'a' } },
    { insert: 'Fala da Sara.\n', attributes: { speaker: 'b' } }
  ]
};
normalizeVersions(withUnassigned);
const unassignedPlan = buildRehearsalPlan(withUnassigned);
assert.equal(unassignedPlan.hasUnassigned, true);
assert.equal(unassignedPlan.unassignedSegments.length, 2);
assert.deepEqual(unassignedPlan.turns.map(t => t.participantId), ['a', 'a', 'b']);
check('Trechos sem participante geram aviso claro sem atribuir fala à pessoa errada');

// 6. Active version switching & progressive hints
createContentVersion(part, 'Versão curta', false);
part.delta = {
  ops: [
    { insert: 'Apenas Maria inicia na versão curta.\n', attributes: { speaker: 'p-maria' } },
    { insert: 'João encerra na versão curta.\n', attributes: { speaker: 'p-joao' } }
  ]
};
const shortPlan = buildRehearsalPlan(part, { bypassCache: true });
assert.equal(shortPlan.versionName, 'Versão curta');
assert.equal(shortPlan.turns.length, 2);
selectContentVersion(part, part.versions[0].id);
assert.equal(buildRehearsalPlan(part).turns.length, 4);
const line = ' Gostaria muito de compartilhar um pensamento animador com sua família hoje de manhã. ';
assert.equal(computeProgressiveHint(line, 0).text, '');
assert.equal(computeProgressiveHint(line, 1).complete, false);
assert.equal(computeProgressiveHint(line, 3).complete, true);
assert.equal(cleanSpokenText({ ops: [{ insert: 'Olá ' }, { insert: { pagebreak: true } }, { insert: 'mundo\n' }] }), 'Olá\nmundo');
check('Versão ativa do documento e dicas progressivas de memorização funcionam sem mutar dados');

// 7. Manual controller + stale TTS session guard + iOS blocked playback recovery + mutual exclusion
function createFakePlayer(voices = [
  { name: 'Voz-A', locale: 'pt-BR', offline: true, default: true, label: 'Português · Voz A' },
  { name: 'Voz-B', locale: 'pt-BR', offline: true, default: false, label: 'Português · Voz B' }
]) {
  const calls = [];
  let current = null;
  let interruptHandler = null;
  let seq = 0;
  return {
    calls,
    get current() { return current; },
    getAvailableVoices(locale) { return { status: 'ready', locale, voices, allVoices: voices }; },
    setExternalInterruptHandler(fn) { interruptHandler = fn; },
    triggerExternalAudio() { current = null; interruptHandler?.('ouvir'); },
    speakSegment(opts) { const reqId = `seg-${++seq}`; current = { reqId, ...opts }; calls.push(current); opts.onStart?.(); return reqId; },
    cancelSegment(reqId) { if (current && (!reqId || current.reqId === reqId)) { current.cancelled = true; current = null; } },
    finishCurrent() { const c = current; current = null; c?.onEnd?.(); },
    blockCurrent(code = 'not-allowed') { const c = current; current = null; c?.onError?.({ code, message: 'Bloqueado pelo Safari.' }); }
  };
}

function makeThreeSpeakerPart(myId = 'p1') {
  const p = newPart();
  p.id = 'part-test-1';
  p.participants = [{ id: 'p1', name: 'João' }, { id: 'p2', name: 'Maria' }, { id: 'p3', name: 'Pedro' }];
  p.myParticipantId = myId;
  p.delta = {
    ops: [
      { insert: 'Bom dia, Maria.\n', attributes: { speaker: 'p1' } },
      { insert: 'Bom dia, João!\n', attributes: { speaker: 'p2' } },
      { insert: 'Posso participar também?\n', attributes: { speaker: 'p3' } },
      { insert: 'Claro, Pedro, fique à vontade.\n', attributes: { speaker: 'p1' } }
    ]
  };
  normalizeVersions(p);
  return p;
}

{
  let micTouched = false;
  const fakeVad = {
    ensureSession: async () => { micTouched = true; return { ok: true }; },
    startListeningTurn: async () => { micTouched = true; return { started: true }; },
    stopListening() {},
    release() {}
  };
  const fakePlayer = createFakePlayer();
  const audio = createRehearsalAudio({ player: fakePlayer, getSettings: () => ({ language: 'pt-BR', rate: 1 }) });
  const controller = createRehearsalController({ audio, vad: fakeVad });
  await controller.start({ speech: makeThreeSpeakerPart('p1'), mode: 'manual', hideMyLines: true, showHints: true });
  assert.equal(micTouched, false);
  assert.equal(controller.getSnapshot().state, 'waiting-user');
  controller.finishUserTurn();
  const oldOnEnd = fakePlayer.current.onEnd;
  controller.pause();
  oldOnEnd();
  assert.equal(controller.getSnapshot().currentTurnIndex, 1);
  await controller.resume();
  fakePlayer.finishCurrent();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(controller.getSnapshot().currentTurnIndex, 2);
  fakePlayer.blockCurrent('not-allowed');
  assert.equal(controller.getSnapshot().state, 'paused');
  await controller.resume();
  fakePlayer.finishCurrent();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(controller.getSnapshot().state, 'waiting-user');
  controller.finishUserTurn();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(controller.getSnapshot().state, 'completed');
  check('Modo Manual sem microfone, proteção contra callback antigo e retomada de áudio bloqueado no Safari');
}

// 8. Automatic VAD mode + fallback to Manual on disconnect or denied permission
{
  let fakeNow = 1000;
  let currentAmplitude = 0.004;
  let intervalCb = null;
  let endedListener = null;
  const fakeTrack = {
    enabled: true,
    readyState: 'live',
    stop() { this.readyState = 'ended'; },
    addEventListener(ev, fn) { if (ev === 'ended') endedListener = fn; },
    removeEventListener(ev, fn) { if (ev === 'ended' && endedListener === fn) endedListener = null; }
  };
  const vad = createRehearsalVad({
    now: () => fakeNow,
    setIntervalFn: fn => { intervalCb = fn; return 99; },
    clearIntervalFn: () => { intervalCb = null; },
    mediaDevices: { async getUserMedia() { fakeTrack.readyState = 'live'; return { getAudioTracks: () => [fakeTrack], getTracks: () => [fakeTrack] }; } },
    AudioContextClass: class {
      constructor() { this.state = 'running'; }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createAnalyser() { return { fftSize: 256, smoothingTimeConstant: 0.25, disconnect() {}, getFloatTimeDomainData(buf) { buf.fill(currentAmplitude); } }; }
      async close() { this.state = 'closed'; }
    }
  });
  const advanceMs = (ms, amp) => {
    currentAmplitude = amp;
    const steps = Math.round(ms / 60);
    for (let i = 0; i < steps; i += 1) { fakeNow += 60; intervalCb?.(); }
  };
  const fakePlayer = createFakePlayer();
  const audio = createRehearsalAudio({ player: fakePlayer, getSettings: () => ({ language: 'pt-BR', rate: 1 }) });
  const controller = createRehearsalController({ audio, vad });
  await controller.start({ speech: makeThreeSpeakerPart('p1'), mode: 'auto', silenceSeconds: 3 });
  advanceMs(8000, 0.005);
  assert.equal(controller.getSnapshot().currentTurnIndex, 0);
  advanceMs(120, 0.15);
  advanceMs(5000, 0.005);
  assert.equal(controller.getSnapshot().currentTurnIndex, 0);
  advanceMs(600, 0.09);
  advanceMs(1200, 0.004);
  assert.equal(controller.getSnapshot().currentTurnIndex, 0);
  advanceMs(1860, 0.004);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(controller.getSnapshot().currentTurnIndex, 1);
  fakePlayer.finishCurrent();
  await new Promise(r => setTimeout(r, 0));
  fakePlayer.finishCurrent();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(controller.getSnapshot().state, 'listening');
  endedListener?.();
  assert.equal(controller.getSnapshot().mode, 'manual');
  assert.equal(controller.getSnapshot().state, 'waiting-user');
  assert.equal(controller.getSnapshot().currentTurnIndex, 3);
  controller.stop();
  check('Modo Automático aguarda início real da fala, respeita silêncio configurado e cai para Manual sem perder turno');
}

// 9. Compiled Apple host bundle checks
const appJs = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert(appJs.includes('SEPREPARE REHEARSAL BUNDLE START'));
assert(appJs.includes('SePrepareRehearsalRuntime'));
assert(appJs.includes('1.0.73'));
check('Host Apple compilado inclui Ensaio interativo 1.0.73 preservando contratos do PWA');
