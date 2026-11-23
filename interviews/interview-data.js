// Interviews have their own schema inside the notebook's protected root data.
// Older clients can still read the speech/part collection and carry the extension.
export const interviewLimits = Object.freeze({items: 120, versions: 24, questions: 48, sessions: 360, bytes: 2_500_000});
export const interviewLanguages = Object.freeze(['pt-BR', 'en-US', 'es-ES', 'ja-JP']);
const interviewKinds = ['general', 'first', 'behavioral', 'technical', 'custom'];
const reviewValues = ['', 'clear', 'improve', 'repeat'];
const idPattern = /^(?:iv|vr|qs|ss|at|rec)-[\w-]{8,85}$/;
export const interviewId = kind => `${kind}-${globalThis.crypto.randomUUID?.() || Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`;
export const newInterviewLibrary = () => ({schema: 1, items: [], sessions: [], removedItems: [], removedSessions: []});
const fail = () => {throw new Error('invalid-interview-data');};
const requireValue = ok => {if (!ok) fail();};
const text = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || !!value.trim());
const number = n => Number.isSafeInteger(n) && n >= 0;
const ident = id => typeof id === 'string' && idPattern.test(id);
const identified = (id, prefix) => ident(id) && id.startsWith(`${prefix}-`);

function rows(value, max, check) {
  requireValue(Array.isArray(value) && value.length <= max);
  const used = new Set();
  for (const row of value) {
    requireValue(row && ident(row.id) && !used.has(row.id));
    used.add(row.id);
    check(row);
  }
}

function questions(value) {
  rows(value, interviewLimits.questions, q => {
    requireValue(identified(q.id, 'qs') && text(q.prompt, 600, true) && text(q.hint, 360) && text(q.notes, 800));
    requireValue(q.reference === undefined || text(q.reference, 800));
  });
  requireValue(value.length > 0);
}

function itemCheck(item) {
  requireValue(identified(item.id, 'iv') && text(item.title, 120, true) && text(item.categoryId, 200) && number(item.changedAt));
  requireValue(item.pinned === undefined || typeof item.pinned === 'boolean');
  rows(item.versions, interviewLimits.versions, v => {
    requireValue(identified(v.id, 'vr') && text(v.name, 72, true) && text(v.role, 120) && text(v.area, 120) && text(v.level, 80) && interviewKinds.includes(v.kind) && interviewLanguages.includes(v.language) && number(v.changedAt));
    requireValue(number(v.targetSec) && v.targetSec <= 600);
    questions(v.questions);
  });
  requireValue(item.versions.some(v => v.id === item.activeId));
}

function segments(value) {
  requireValue(Array.isArray(value) && value.length <= 60);
  for (const segment of value) {
    requireValue(segment && identified(segment.recordingId, 'rec') && number(segment.startMs) && number(segment.endMs) && segment.endMs > segment.startMs && segment.endMs <= 86_400_000);
  }
}

function sessionCheck(s) {
  requireValue(identified(s.id, 'ss') && identified(s.interviewId, 'iv') && identified(s.versionId, 'vr') && text(s.versionName, 72, true) && text(s.title, 120, true));
  requireValue(interviewLanguages.includes(s.language) && ['guided', 'simulation'].includes(s.mode) && ['paused', 'partial', 'done'].includes(s.status));
  requireValue(typeof s.voice === 'boolean' && typeof s.record === 'boolean' && number(s.createdAt) && number(s.changedAt) && number(s.targetSec) && s.targetSec <= 600);
  questions(s.questions);
  requireValue(number(s.cursor) && s.cursor <= s.questions.length && (s.status !== 'done' || s.cursor === s.questions.length));
  const ids = new Set(s.questions.map(q => q.id));
  rows(s.attempts, 2 * interviewLimits.questions, a => {
    requireValue(identified(a.id, 'at') && ids.has(a.questionId) && ['answered', 'skipped'].includes(a.result) && number(a.elapsedMs) && number(a.changedAt) && typeof a.hintUsed === 'boolean' && reviewValues.includes(a.review) && text(a.note, 1200));
    segments(a.audioSegments);
  });
  requireValue(s.draft && number(s.draft.elapsedMs) && typeof s.draft.hintUsed === 'boolean');
  segments(s.draft.audioSegments);
}

export function interviewLibrary(value) {
  if (value === undefined) return newInterviewLibrary();
  requireValue(value && value.schema === 1);
  rows(value.items, interviewLimits.items, itemCheck);
  rows(value.sessions, interviewLimits.sessions, sessionCheck);
  rows(value.removedItems, 4000, row => requireValue(identified(row.id, 'iv') && number(row.at)));
  rows(value.removedSessions, 4000, row => requireValue(identified(row.id, 'ss') && number(row.at)));
  const removedItems = new Set(value.removedItems.map(row => row.id));
  const removedSessions = new Set(value.removedSessions.map(row => row.id));
  const itemIds = new Set(value.items.map(row => row.id));
  requireValue(value.items.every(row => !removedItems.has(row.id)) && value.sessions.every(row => itemIds.has(row.interviewId) && !removedSessions.has(row.id)));
  requireValue(new TextEncoder().encode(JSON.stringify(value)).length <= interviewLimits.bytes);
  return value;
}

export const hasInterviewData = value => ['items', 'sessions', 'removedItems', 'removedSessions'].some(key => !!value?.[key]?.length);
export const activeInterviewVersion = item => item.versions.find(v => v.id === item.activeId);
export const emptyAnswerDraft = () => ({elapsedMs: 0, hintUsed: false, audioSegments: []});

export function createInterviewSession(item, {mode, voice, record, surprise = false, questionIds, random = Math.random, now = Date.now()}) {
  const version = activeInterviewVersion(item);
  const selected = questionIds ? new Set(questionIds) : null;
  const questions = version.questions.filter(q => !selected || selected.has(q.id));
  if (surprise) {
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
  }
  const result = {
    id: interviewId('ss'), interviewId: item.id, versionId: version.id, title: item.title, versionName: version.name,
    language: version.language, targetSec: version.targetSec, mode, voice, record, createdAt: now, changedAt: now,
    status: 'paused', questions: JSON.parse(JSON.stringify(questions)), cursor: 0, attempts: [], draft: emptyAnswerDraft(),
  };
  sessionCheck(result);
  return result;
}

export function confirmInterviewAnswer(session, expectedQuestion, outcome, draft, now = Date.now()) {
  if (session.status !== 'paused' || session.questions[session.cursor]?.id !== expectedQuestion) return null;
  const answered = outcome === 'answered';
  const attempt = {
    id: interviewId('at'), questionId: expectedQuestion, result: outcome, changedAt: now,
    elapsedMs: answered ? draft.elapsedMs : 0, hintUsed: draft.hintUsed,
    audioSegments: answered ? draft.audioSegments : [], review: '', note: '',
  };
  const cursor = session.cursor + 1;
  const next = {...session, cursor, attempts: [...session.attempts, attempt], draft: emptyAnswerDraft(), changedAt: now, status: cursor === session.questions.length ? 'done' : 'paused'};
  sessionCheck(next);
  return next;
}

function canonical(value) {
  return JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}

function latest(a, b) {
  if ((a.changedAt ?? a.at) !== (b.changedAt ?? b.at)) return (a.changedAt ?? a.at) > (b.changedAt ?? b.at) ? a : b;
  return canonical(a) >= canonical(b) ? a : b;
}

function union(left, right, resolve = latest) {
  const map = new Map(left.map(row => [row.id, row]));
  for (const row of right) map.set(row.id, map.has(row.id) ? resolve(map.get(row.id), row) : row);
  return [...map.values()].sort((a, b) => a.id < b.id ? -1 : a.id === b.id ? 0 : 1);
}

// A different revision of the same version is preserved when neither side
// matches the common checkpoint. The derived ID keeps repeated merges stable.
function conflictVersion(version) {
  const source = canonical(version);
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < source.length; i++) {
    a = Math.imul(a ^ source.charCodeAt(i), 0x1000193);
    b = Math.imul(b ^ source.charCodeAt(i), 0x85ebca6b);
  }
  return {...version, id: `vr-conflict-${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`, alternative: true};
}

export function mergeInterviewLibraries(here, there, base, categoryMap) {
  if (there === undefined) return here === undefined ? undefined : interviewLibrary(here);
  const left = interviewLibrary(here), right = interviewLibrary(there);
  const prior = base === undefined ? null : interviewLibrary(base);
  const removedItems = union(left.removedItems, right.removedItems);
  const removedSessions = union(left.removedSessions, right.removedSessions);
  const removedItemIds = new Set(removedItems.map(row => row.id)), removedSessionIds = new Set(removedSessions.map(row => row.id));
  const items = union(left.items, right.items.map(item => categoryMap?.has(item.categoryId) ? {...item, categoryId: categoryMap.get(item.categoryId)} : item), (a, b) => {
    const priorItem = prior?.items.find(row => row.id === a.id);
    if (canonical(a) === canonical(b)) return a;
    if (priorItem && canonical(a) === canonical(priorItem)) return b;
    if (priorItem && canonical(b) === canonical(priorItem)) return a;
    const chosen = latest(a, b), alternates = [];
    const versions = union(a.versions, b.versions, (av, bv) => {
      if (canonical(av) === canonical(bv)) return av;
      const pv = priorItem?.versions.find(v => v.id === av.id);
      if (pv && canonical(av) === canonical(pv)) return bv;
      if (pv && canonical(bv) === canonical(pv)) return av;
      const keep = latest(av, bv);
      alternates.push(conflictVersion(keep === av ? bv : av));
      return keep;
    }).filter(v => !priorItem?.versions.some(p => p.id === v.id && canonical(p) === canonical(v) && (!a.versions.some(x => x.id === v.id) || !b.versions.some(x => x.id === v.id)) && v.id !== chosen.activeId));
    return {...chosen, versions: union(versions, alternates)};
  }).filter(row => !removedItemIds.has(row.id));
  const itemIds = new Set(items.map(item => item.id));
  const sessions = union(left.sessions, right.sessions, (a, b) => {
    if (canonical(a) === canonical(b)) return a;
    const kept = a.cursor === b.cursor ? latest(a, b) : a.cursor > b.cursor ? a : b;
    return {...kept, attempts: union(a.attempts, b.attempts), changedAt: Math.max(a.changedAt, b.changedAt)};
  }).filter(row => itemIds.has(row.interviewId) && !removedSessionIds.has(row.id));
  return interviewLibrary({schema: 1, items, sessions, removedItems, removedSessions});
}

export const INTERVIEW_FILE = 'seprepare-interview-v1';
export function encodeInterview(item) {
  itemCheck(item);
  return JSON.stringify({format: INTERVIEW_FILE, title: item.title, activeId: item.activeId, versions: item.versions.map(v => ({
    id: v.id, name: v.name, role: v.role, area: v.area, level: v.level, kind: v.kind, language: v.language, targetSec: v.targetSec,
    questions: v.questions.map(q => ({id: q.id, prompt: q.prompt, hint: q.hint, notes: '', ...(q.reference ? {reference:q.reference} : {})})),
  }))}, null, 2);
}

export function decodeInterview(raw) {
  if (typeof raw !== 'string' || raw.length > interviewLimits.bytes) return null;
  let parsed;
  try {parsed = JSON.parse(raw);} catch {return null;}
  if (typeof parsed?.format !== 'string' || !parsed.format.startsWith('seprepare-interview-')) return null;
  requireValue(parsed.format === INTERVIEW_FILE && Array.isArray(parsed.versions));
  const versions = parsed.versions.map(v => ({...v, changedAt: 0}));
  const item = {id: 'iv-import-preview', title: parsed.title, categoryId: '', activeId: parsed.activeId, changedAt: 0, versions};
  itemCheck(item);
  const newQuestions = new Map();
  const imported = versions.map(v => ({
    id: interviewId('vr'), name:v.name, role:v.role, area:v.area, level:v.level, kind:v.kind, language:v.language, targetSec:v.targetSec,
    changedAt: Date.now(), questions: v.questions.map(q => {
      if (!newQuestions.has(q.id)) newQuestions.set(q.id, interviewId('qs'));
      return {id:newQuestions.get(q.id), prompt:q.prompt, hint:q.hint, notes:'', ...(q.reference ? {reference:q.reference} : {})};
    }),
  }));
  return {...item, id:interviewId('iv'), changedAt:Date.now(), versions:imported, activeId:imported[versions.findIndex(v => v.id === item.activeId)].id};
}
