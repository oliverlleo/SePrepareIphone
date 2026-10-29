import {isPart,partSegments,participantName,activeContentVersion,versionContentKey} from '../sharing/core.js';
import {withoutNoteAttributes} from '../sharing/notes-core.js';

export const REHEARSAL_STATES = Object.freeze([
  'idle',
  'preparing',
  'narrating',
  'waiting-user',
  'listening',
  'paused',
  'completed',
  'error'
]);

export const SILENCE_OPTIONS = Object.freeze([2, 3, 5]);

export function cleanSpokenText(delta) {
  const cleanDelta = withoutNoteAttributes(delta);
  let raw = '';
  for (const op of cleanDelta.ops || []) {
    if (typeof op.insert === 'string') {
      raw += op.insert;
    } else if (op.insert && op.insert.pagebreak === true) {
      raw += '\n';
    }
  }
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function countSpokenWords(text) {
  const matches = String(text ?? '').match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

function segmentPageSpan(delta, startPage) {
  let current = startPage;
  const pages = [current];
  for (const op of delta?.ops || []) {
    if (op.insert && op.insert.pagebreak === true) {
      current += 1;
      pages.push(current);
    }
  }
  return { pages, endPage: current };
}

export function canOfferInteractiveRehearsal(speech) {
  if (!isPart(speech)) return false;
  const v = activeContentVersion(speech);
  const participants = Array.isArray(speech?.participants)
    ? speech.participants
    : Array.isArray(v?.participants)
      ? v.participants
      : [];
  return participants.length > 0;
}

const planCache = {
  key: '',
  value: null
};

export function buildRehearsalPlan(speech, options = {}) {
  if (!speech || !isPart(speech)) {
    return {
      valid: false,
      reason: 'not-part',
      versionId: '',
      versionName: '',
      contentKey: '',
      myParticipantId: '',
      participants: [],
      turns: [],
      unassignedSegments: [],
      totalWords: 0
    };
  }

  const activeVer = activeContentVersion(speech);
  const delta = speech.delta || activeVer?.delta || { ops: [{ insert: '\n' }] };
  const participants = Array.isArray(speech.participants)
    ? speech.participants.map(p => ({ id: p.id, name: p.name }))
    : Array.isArray(activeVer?.participants)
      ? activeVer.participants.map(p => ({ id: p.id, name: p.name }))
      : [];
  const validIds = new Set(participants.map(p => p.id));
  const requestedMe = options.myParticipantId !== undefined
    ? String(options.myParticipantId || '')
    : String(speech.myParticipantId || activeVer?.myParticipantId || '');
  const myParticipantId = validIds.has(requestedMe) ? requestedMe : '';
  const versionId = String(activeVer?.id || speech.activeVersionId || 'default');
  const versionName = String(activeVer?.name || 'Versão original');
  const contentKey = versionContentKey({ delta, participants });
  const cacheKey = `${speech.id || ''}|${versionId}|${contentKey}|${myParticipantId}`;

  if (!options.bypassCache && planCache.key === cacheKey && planCache.value) {
    return planCache.value;
  }

  const source = { delta, participants, myParticipantId, type: 'part', partFormat: 2 };
  const rawSegments = partSegments(source);
  const unassignedSegments = [];
  const turns = [];

  let audioOffset = 0;
  let pageCursor = 0;
  let canMergeWithPrevious = false;

  rawSegments.forEach((seg, segIdx) => {
    const pid = validIds.has(seg.participantId) ? seg.participantId : '';
    const label = participantName(source, pid);
    const legacySpoken = (pid ? label + ':\n' : '') + seg.text.trimEnd();
    const audioStart = audioOffset;
    audioOffset += legacySpoken.length + (segIdx < rawSegments.length - 1 ? 2 : 0);
    const audioEnd = audioOffset;

    const span = segmentPageSpan(seg.delta, pageCursor);
    pageCursor = span.endPage;

    const spokenText = cleanSpokenText(seg.delta);
    if (!spokenText) return;

    const wordCount = countSpokenWords(spokenText);

    if (!pid) {
      canMergeWithPrevious = false;
      unassignedSegments.push({
        segmentIndex: segIdx,
        id: seg.id,
        start: seg.start,
        end: seg.end,
        audioStart,
        audioEnd,
        page: span.pages[0],
        pages: span.pages,
        wordCount,
        preview: spokenText.length > 96 ? spokenText.slice(0, 93).trimEnd() + '…' : spokenText
      });
      return;
    }

    const previous = turns.at(-1);
    if (canMergeWithPrevious && previous && previous.participantId === pid) {
      previous.end = seg.end;
      previous.audioEnd = audioEnd;
      previous.segmentIndices.push(segIdx);
      previous.audioStarts.push(audioStart);
      previous.spokenText = `${previous.spokenText}\n\n${spokenText}`;
      previous.wordCount += wordCount;
      for (const p of span.pages) {
        if (!previous.pages.includes(p)) previous.pages.push(p);
      }
      return;
    }

    canMergeWithPrevious = true;
    const isUser = Boolean(myParticipantId && pid === myParticipantId);
    turns.push({
      index: turns.length,
      id: `turn-${turns.length}-${seg.start}`,
      participantId: pid,
      participantName: label,
      isUser,
      role: isUser ? 'user' : 'other',
      spokenText,
      wordCount,
      start: seg.start,
      end: seg.end,
      audioStart,
      audioEnd,
      audioStarts: [audioStart],
      segmentIndices: [segIdx],
      page: span.pages[0],
      pages: [...span.pages]
    });
  });

  const usedParticipantIds = [...new Set(turns.map(t => t.participantId))];
  const userTurnCount = turns.filter(t => t.isUser).length;
  const otherTurnCount = turns.filter(t => !t.isUser).length;
  const totalWords = turns.reduce((acc, t) => acc + t.wordCount, 0);

  const warnings = [];
  if (unassignedSegments.length > 0) warnings.push('unassigned-segments');
  if (myParticipantId && turns.length > 0 && userTurnCount === 0) warnings.push('no-user-turns');
  if (myParticipantId && turns.length > 0 && otherTurnCount === 0) warnings.push('no-other-turns');

  let reason = '';
  if (participants.length < 2) {
    reason = 'need-two-participants';
  } else if (turns.length === 0) {
    reason = unassignedSegments.length > 0 ? 'all-unassigned' : 'empty-turns';
  } else if (!myParticipantId) {
    reason = 'missing-identity';
  }

  const plan = Object.freeze({
    valid: reason === '',
    reason,
    warnings,
    versionId,
    versionName,
    contentKey,
    myParticipantId,
    participants,
    usedParticipantIds,
    turns,
    userTurnCount,
    otherTurnCount,
    unassignedSegments,
    hasUnassigned: unassignedSegments.length > 0,
    totalWords
  });

  planCache.key = cacheKey;
  planCache.value = plan;
  return plan;
}

export function computeProgressiveHint(spokenText, level = 0) {
  const source = String(spokenText ?? '').trim();
  const normalizedLevel = Math.max(0, Math.min(3, Math.floor(Number(level) || 0)));
  if (!source || normalizedLevel <= 0) {
    return { level: 0, maxLevel: 3, text: '', complete: false };
  }
  if (normalizedLevel >= 3) {
    return { level: 3, maxLevel: 3, text: source, complete: true };
  }

  const tokens = [...source.matchAll(/\S+/g)];
  const total = tokens.length;
  if (total === 0) {
    return { level: 3, maxLevel: 3, text: source, complete: true };
  }

  if (total === 1) {
    const word = tokens[0][0];
    if (word.length <= 3 || normalizedLevel === 2) {
      return { level: normalizedLevel, maxLevel: 3, text: source, complete: true };
    }
    const cut = Math.max(1, Math.ceil(word.length * 0.45));
    return { level: 1, maxLevel: 3, text: `${word.slice(0, cut)}…`, complete: false };
  }

  if (total === 2) {
    if (normalizedLevel === 1) {
      const end = tokens[0].index + tokens[0][0].length;
      return { level: 1, maxLevel: 3, text: `${source.slice(0, end)}…`, complete: false };
    }
    return { level: 2, maxLevel: 3, text: source, complete: true };
  }

  const firstCount = Math.min(4, Math.max(1, Math.min(total - 2, Math.ceil(total * 0.22))));
  const secondCount = Math.min(total - 1, Math.max(firstCount + 1, Math.ceil(total * 0.58)));
  const targetCount = normalizedLevel === 1 ? firstCount : secondCount;
  const lastToken = tokens[targetCount - 1];
  const sliceEnd = lastToken.index + lastToken[0].length;
  const excerpt = source.slice(0, sliceEnd).replace(/[,;:\-–—]+$/, '').trimEnd();

  return {
    level: normalizedLevel,
    maxLevel: 3,
    text: `${excerpt}…`,
    complete: false
  };
}
