import {
  activeInterviewVersion, confirmInterviewAnswer, createInterviewSession, decodeInterview, encodeInterview, interviewId,
  interviewLanguages, interviewLibrary, interviewLimits,
} from './interview-data.js';
import {interviewPacks, interviewQuestions} from './interview-questions.js';
import {createInterviewRecorder} from './interview-recording.js';
import {createRehearsalVad} from '../rehearsal/interactive-rehearsal-vad.js';
import {sharedMicrophone} from '../recordings/shared-microphone.js';
import {interviewText} from './interview-text.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const fold = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const copy = value => JSON.parse(JSON.stringify(value));
const clock = ms => `${Math.floor(Math.max(0, ms) / 60_000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0')}`;
const countWords = text => (String(text ?? '').match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu) || []).length;
const languageNames = ['Português (Brasil)', 'English', 'Español', '日本語'];
const REHEARSAL_PREFS_KEY = 'seprepare_interview_rehearsal_v1';
const ICON_HIDE_TOOLS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="m9 16 3-3 3 3"/></svg>';
const ICON_SHOW_TOOLS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="m15 14-3 3-3-3"/></svg>';
const packIcons = {
  general: 'Mic', first: 'GraduationCap', behavioral: 'Users', support: 'Headphones',
  sheets: 'ListChecks', service: 'HandHeart', sales: 'Target', logistics: 'FolderOpen',
  admin: 'FileText', software: 'Sparkles', marketing: 'Flag', leadership: 'Star',
};

function loadRehearsalPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(REHEARSAL_PREFS_KEY) || '{}');
    return {
      autoMic: Boolean(raw.autoMic),
      silenceSeconds: [2, 3, 5].includes(Number(raw.silenceSeconds)) ? Number(raw.silenceSeconds) : 3,
    };
  } catch {
    return {autoMic: false, silenceSeconds: 3};
  }
}

function saveRehearsalPrefs(cfg) {
  try {
    localStorage.setItem(REHEARSAL_PREFS_KEY, JSON.stringify({
      autoMic: Boolean(cfg.autoMic),
      silenceSeconds: [2, 3, 5].includes(Number(cfg.silenceSeconds)) ? Number(cfg.silenceSeconds) : 3,
    }));
  } catch {}
}

export function createInterviewUI(host) {
  const t = (key, data) => interviewText(host.state().settings.language, key, data);
  const tr = (key, data) => escape(t(key, data));
  const icon = key => host.icon(key);
  const library = () => interviewLibrary(host.state().interviews);
  const item = () => library().items.find(row => row.id === itemId);
  const session = () => library().sessions.find(row => row.id === sessionId);
  const root = () => document.querySelector('#app');
  const overlays = () => document.querySelector('#overlays');
  const screenRoot = () => root()?.querySelector('.iv-shell');
  const isNative = typeof window !== 'undefined' && !!window.OradorNative;
  const vad = createRehearsalVad({
    ...(isNative ? {} : {mediaDevices: sharedMicrophone}),
    t: value => value,
  });

  let screen = 'home', editorOrigin = 'home', modal = null, modalTab = 'browse', itemId, sessionId, draftItem, originalItem, importedItem;
  let pack = 'general', autoPacks = new Set(['general']), autoDepth = 6, autoSeed = 0, autoReplace = true;
  let areaDropdownOpen = false, editorExpanded = false, editorToolsHidden = false, editorFooterHidden = false, disposeEditorScroll = () => {};
  let selectedBankKeys = new Set(), prefillPoints = true, showEditorHints = false, draftDirty = false;
  let activeQId = '', activeField = 'prompt', replacingQId, focusMode = false;
  let phase = 'idle', pending = false, interruptionRequested = false, hintOpen = false, notices = [];
  let elapsedStart = null, timing = null, questionGeneration = 0, speakerRequest = null, answerDraft = null;
  let recorder = null, captureAbort = null, player = null, playerGeneration = 0, repeatSelection = new Set();
  let saveTimer = null, quietSave = null, helpTimer = null;
  const savedPrefs = loadRehearsalPrefs();
  let config = {mode: 'guided', voice: true, autoMic: savedPrefs.autoMic, silenceSeconds: savedPrefs.silenceSeconds, record: false, surprise: false, hideAnswers: false, questionIds: undefined};

  const helpAttrs = (titleKey, detailKey) => titleKey && detailKey ? ` data-help-title="${tr(titleKey)}" data-help-detail="${tr(detailKey)}"` : '';
  const button = (action, label, glyph, style = 'secondary', extra = '', data) => `<button type="button" class="btn ${style}" data-iv-action="${action}" ${extra}>${glyph ? icon(glyph) : ''}<span>${tr(label, data)}</span></button>`;
  const iconButton = (action, label, glyph, extra = '', cls = '') => `<button type="button" class="icon-btn ${cls}" data-iv-action="${action}" ${extra} aria-label="${tr(label)}">${icon(glyph)}</button>`;
  const toolButton = (action, label, glyph, extra = '', detailKey = '') => `<button type="button" class="tool" data-iv-action="${action}" aria-label="${tr(label)}" title="${tr(label)}"${helpAttrs(label, detailKey)} ${extra}>${icon(glyph)}</button>`;
  const option = (value, label, chosen) => `<option value="${escape(value)}"${value === chosen ? ' selected' : ''}>${escape(label)}</option>`;
  const questionCount = count => tr(count === 1 ? 'oneQuestion' : 'questionCount', {n: count});
  const message = (key, role = 'status') => `<p class="iv-message" role="${role}">${tr(key)}</p>`;

  function clearContextHelp() {
    clearTimeout(helpTimer);
    document.dispatchEvent(new Event('focusout'));
    document.getElementById('seprepareContextHelp')?.remove();
  }
  function setNotice(key) {if (!notices.includes(key)) notices.push(key);}
  function refreshStatus() {
    const target = screenRoot()?.querySelector('.iv-notices');
    if (target) target.innerHTML = notices.map(k => message(k)).join('');
  }

  function resizeField(el) {
    if (!el || !el.matches?.('.iv-doc-input, [data-iv-field="title"]')) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  function formatPoints(reference) {
    if (!reference) return '';
    const parts = String(reference).split(/(?<=[.!?。])\s+/u).map(s => s.trim()).filter(Boolean);
    return parts.map(s => `• ${s}`).join('\n').slice(0, 800);
  }

  function pointsTextFor(q) {
    if (!q) return '';
    return q.reference?.trim() ? formatPoints(q.reference) : q.hint?.trim() ? `• ${q.hint.trim()}` : '';
  }

  function needsPoints(q) {
    const pts = pointsTextFor(q);
    return Boolean(pts && !String(q.notes || '').includes(pts));
  }

  function pointsTargets(qs, preferredId) {
    const emptyTargets = qs.filter(q => !String(q.notes || '').trim() && Boolean(pointsTextFor(q)));
    if (emptyTargets.length) return emptyTargets;
    const preferred = qs.find(row => row.id === preferredId);
    if (needsPoints(preferred)) return [preferred];
    const any = qs.find(needsPoints);
    return any ? [any] : [];
  }

  function syncUsePointsTool(shell = screenRoot()) {
    const tb = shell?.querySelector('.toolbar [data-iv-action="use-points"]');
    if (!tb || !draftItem) return;
    const qs = activeInterviewVersion(draftItem)?.questions || [];
    if (pointsTargets(qs, activeQId).length > 0) tb.removeAttribute('aria-disabled');
    else tb.setAttribute('aria-disabled', 'true');
  }

  function levelKeyFor(q, packKey, idx) {
    if (q?.level) return q.level;
    if (packKey === 'general') return idx <= 3 ? 'levelBasic' : idx <= 8 ? 'levelPractical' : 'levelComplex';
    return idx <= 3 ? 'levelBasic' : idx <= 7 ? 'levelPractical' : 'levelComplex';
  }

  function makeQuestion(data = {}, fillAnswer = false) {
    const ref = data.reference || '';
    const notes = data.notes !== undefined ? data.notes : (fillAnswer && ref ? formatPoints(ref) : '');
    const hint = data.hint !== undefined ? data.hint : ref;
    const itemObj = {
      id: interviewId('qs'),
      prompt: String(data.prompt || '').slice(0, 600),
      hint: String(hint || '').slice(0, 360),
      notes: String(notes || '').slice(0, 800),
      ...(ref ? {reference: String(ref).slice(0, 800)} : {}),
    };
    const lvl = data._level || data.level;
    if (lvl) Object.defineProperty(itemObj, '_level', {value: lvl, enumerable: false});
    return itemObj;
  }

  function buildAutomaticScript(areaSet, depth, language, seed = 0, fillAnswer = true) {
    const areas = [...areaSet].filter(k => interviewPacks.includes(k));
    const list = areas.length ? areas : ['general'];
    const used = new Set();
    const picked = [];
    const pushQ = (q, fallbackLevel) => {
      const key = fold(q?.prompt?.trim());
      if (!key || used.has(key)) return false;
      used.add(key);
      picked.push({...q, _level: q.level || fallbackLevel});
      return true;
    };

    const quotas = depth === 4 ? {levelBasic: 1, levelPractical: 2, levelComplex: 1}
      : depth === 8 ? {levelBasic: 2, levelPractical: 3, levelComplex: 3}
      : {levelBasic: 2, levelPractical: 2, levelComplex: 2};

    const banks = Object.fromEntries(list.map(k => [k, interviewQuestions(k, language).map((q, idx) => ({...q, _level: levelKeyFor(q, k, idx), _pack: k}))]));
    const takeFromLevel = (levelKey, need) => {
      const byPack = list.map(k => banks[k].filter(q => q._level === levelKey));
      const ordered = [];
      const maxLen = Math.max(0, ...byPack.map(arr => arr.length));
      for (let slot = 0; slot < maxLen; slot++) {
        for (let pIdx = 0; pIdx < byPack.length; pIdx++) {
          const arr = byPack[(pIdx + seed) % byPack.length];
          if (arr.length) ordered.push(arr[(slot + seed) % arr.length]);
        }
      }
      let added = 0;
      for (const q of ordered) {
        if (added >= need) break;
        if (pushQ(q, levelKey)) added++;
      }
    };

    takeFromLevel('levelBasic', quotas.levelBasic);
    takeFromLevel('levelPractical', quotas.levelPractical);
    takeFromLevel('levelComplex', quotas.levelComplex);

    if (picked.length < depth) {
      const fallbackPool = [
        ...list.flatMap(k => banks[k]),
        ...interviewQuestions('behavioral', language),
        ...interviewQuestions('general', language),
      ];
      for (let i = 0; i < fallbackPool.length && picked.length < depth; i++) {
        const q = fallbackPool[(i + seed) % fallbackPool.length];
        pushQ(q, q._level || q.level || 'levelPractical');
      }
    }

    const rank = {levelBasic: 0, levelPractical: 1, levelComplex: 2};
    return picked.slice(0, depth).sort((a, b) => rank[a._level] - rank[b._level]).map(q => makeQuestion(q, fillAnswer));
  }

  function recognizeQuestionsFromText(raw) {
    const lines = String(raw || '').split(/\r?\n/).map(l => l.trimEnd());
    const pairs = [];
    let current = null;
    const isQPrefix = /^(?:\d+[.)]\s*)?(?:P|Pergunta|Entrevistador|Q|Question)\s*:\s*(.+)$/iu;
    const isAPrefix = /^(?:R|Resposta|Minha resposta|A|Answer)\s*:\s*(.*)$/iu;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const qm = trimmed.match(isQPrefix);
      const am = trimmed.match(isAPrefix);
      if (qm) {
        if (current && current.prompt.trim()) pairs.push(current);
        current = {prompt: qm[1].trim(), notes: ''};
      } else if (am) {
        if (current) current.notes = current.notes ? `${current.notes}\n${am[1].trim()}` : am[1].trim();
        else current = {prompt: am[1].trim(), notes: ''};
      } else if (/[?？]$/.test(trimmed) && (!current || current.notes.trim() || current.prompt.trim())) {
        const cleaned = trimmed.replace(/^\d+[.)]\s*/, '');
        if (current && current.prompt.trim()) pairs.push(current);
        current = {prompt: cleaned, notes: ''};
      } else if (current) {
        current.notes = current.notes ? `${current.notes}\n${trimmed}` : trimmed;
      } else {
        current = {prompt: trimmed, notes: ''};
      }
    }
    if (current && current.prompt.trim()) pairs.push(current);
    return pairs;
  }

  function isValidDraft(draft) {
    return !!draft && !!draft.title.trim() && draft.versions.every(v => v.name.trim() && v.questions.length > 0 && v.questions.every(q => q.prompt.trim()));
  }

  function ensureDraftTitle() {
    if (!draftItem || draftItem.title.trim()) return;
    const version = activeInterviewVersion(draftItem);
    const chosenAreas = [...autoPacks].filter(k => interviewPacks.includes(k)).map(k => t(k));
    const fallback = version.area || (chosenAreas.length ? chosenAreas.slice(0, 2).join(' · ') : '') || t('title');
    draftItem.title = fallback.slice(0, 120);
  }

  async function commit(change) {
    const state = host.state(), previous = state.interviews;
    let next;
    try {next = interviewLibrary(change(copy(library())));}
    catch {setNotice('limit'); refreshStatus(); return false;}
    state.interviews = next;
    try {if (await host.save()) return true;} catch {}
    if (host.state() === state && state.interviews === next) {
      if (previous === undefined) delete state.interviews; else state.interviews = previous;
      try {await host.save();} catch {}
    }
    setNotice('saveError'); refreshStatus(); return false;
  }

  function scheduleAutosave() {
    clearTimeout(saveTimer);
    if (screen !== 'edit' || !draftItem) return;
    saveTimer = setTimeout(() => {
      if (screen !== 'edit' || !draftItem || !isValidDraft(draftItem)) return;
      void persistDraftQuietly();
    }, 450);
  }

  async function persistDraftQuietly() {
    if (quietSave) return quietSave;
    quietSave = (async () => {
      if (!isValidDraft(draftItem)) return false;
      if (originalItem && JSON.stringify(item()) !== JSON.stringify(originalItem)) return false;
      const saved = {...copy(draftItem), title: draftItem.title.trim(), changedAt: Date.now()};
      if (!await commit(data => ({...data, items: [...data.items.filter(r => r.id !== saved.id), saved]}))) return false;
      itemId = saved.id;
      originalItem = copy(saved);
      draftDirty = false;
      updateEditorStatsUI();
      return true;
    })();
    try {return await quietSave;} finally {quietSave = null;}
  }

  function updateEditorStatsUI() {
    const version = draftItem ? activeInterviewVersion(draftItem) : null;
    if (!version) return;
    const el = screenRoot()?.querySelector('#ivSaveStatus');
    const saveEl = screenRoot()?.querySelector('.editor-save');
    const footer = screenRoot()?.querySelector('#ivFooterStats');
    if (el) el.textContent = draftDirty ? t('saving') : t('editorSaved');
    if (saveEl) {
      const nextTitle = t(draftDirty ? 'save' : 'presentBtn');
      if (saveEl.getAttribute('title') !== nextTitle) saveEl.setAttribute('title', nextTitle);
      const nextLabel = t(draftDirty ? 'saveShort' : 'presentBtn');
      const span = saveEl.querySelector('span');
      if (!span || span.textContent !== nextLabel) {
        saveEl.innerHTML = `${icon(draftDirty ? 'Check' : 'Play')}<span>${escape(nextLabel)}</span>`;
      }
    }
    if (footer) {
      const qs = version.questions;
      const preparedCount = qs.filter(q => q.notes?.trim()).length;
      const wordsTotal = qs.reduce((sum, q) => sum + countWords(q.prompt) + countWords(q.notes), 0);
      footer.textContent = t('footerStats', {q: qs.length, a: preparedCount, w: wordsTotal});
    }
  }

  function setScreen(next, focus = true) {
    if (next !== 'reader') releasePlayer();
    if (next !== 'edit') {
      disposeEditorScroll();
      disposeEditorScroll = () => {};
      editorExpanded = false;
      editorToolsHidden = false;
      editorFooterHidden = false;
    }
    areaDropdownOpen = false;
    screen = next;
    notices = [];
    render(focus);
  }

  async function open(next) {
    if (await host.enter() === false) {host.toast(t('saveError')); return;}
    setScreen(next);
  }

  function defaultLanguage() {
    return interviewLanguages.find(code => code.slice(0, 2) === String(host.state().settings.language).slice(0, 2)) || 'pt-BR';
  }

  function startCreate() {
    const language = defaultLanguage(), id = interviewId('vr');
    const categoryId = host.state().categories.find(c => c.id === host.filters().category)?.id || '';
    const firstQ = makeQuestion({prompt: ''});
    itemId = undefined;
    originalItem = null;
    draftItem = {
      id: interviewId('iv'), title: '', activeId: id, categoryId, changedAt: Date.now(),
      versions: [{id, name: t('original'), role: '', area: '', level: '', kind: 'general', language, targetSec: 120, questions: [firstQ], changedAt: Date.now()}],
    };
    draftDirty = false;
    editorExpanded = false;
    editorToolsHidden = false;
    editorFooterHidden = false;
    editorOrigin = 'home';
    activeQId = firstQ.id;
    activeField = 'prompt';
    autoPacks = new Set(['general']);
    autoSeed = 0;
    selectedBankKeys = new Set();
    modal = null;
    screen = 'edit';
    void open('edit');
  }

  async function openSaved(id) {
    itemId = id;
    phase = 'idle';
    const paused = library().sessions.filter(s => s.interviewId === id && s.status === 'paused').sort((a, b) => b.changedAt - a.changedAt)[0];
    sessionId = paused?.id;
    if (paused) {answerDraft = copy(paused.draft); phase = 'paused';}
    notices = [];
    await open('reader');
  }

  async function openEditSaved(id) {
    itemId = id;
    const saved = item();
    if (!saved) return;
    originalItem = copy(saved);
    draftItem = copy(saved);
    draftDirty = false;
    editorExpanded = false;
    editorToolsHidden = false;
    editorFooterHidden = false;
    editorOrigin = 'home';
    activeQId = activeInterviewVersion(draftItem)?.questions[0]?.id || '';
    activeField = 'prompt';
    modal = null;
    screen = 'edit';
    await open('edit');
  }

  async function openPracticeSaved(id) {
    itemId = id;
    const saved = item();
    if (!saved) return;
    if (await host.enter() === false) {host.toast(t('saveError')); return;}
    screen = 'reader';
    const paused = library().sessions.filter(s => s.interviewId === id && s.status !== 'done').sort((a, b) => b.changedAt - a.changedAt)[0];
    if (paused) {
      sessionId = paused.id;
      await busy(() => activate(paused, false));
    } else {
      await busy(() => activate(createInterviewSession(saved, config), true));
    }
  }

  function editFromReader() {
    const saved = item();
    if (!saved) return;
    cancelSpeaker(); vad.release(); void closeCapture();
    phase = 'idle';
    originalItem = copy(saved);
    draftItem = copy(saved);
    draftDirty = false;
    editorExpanded = false;
    editorToolsHidden = false;
    editorFooterHidden = false;
    editorOrigin = 'reader';
    activeQId = activeInterviewVersion(draftItem)?.questions[0]?.id || '';
    activeField = 'prompt';
    setScreen('edit');
  }

  function flaggedQuestions(version, history) {
    const latest = new Map();
    for (const row of history) {
      for (const attempt of row.attempts) {
        if (attempt.result !== 'answered' || latest.has(attempt.questionId)) continue;
        const prompt = row.questions.find(q => q.id === attempt.questionId)?.prompt;
        latest.set(attempt.questionId, {prompt, review: attempt.review});
      }
    }
    return version.questions.filter(q => {
      const last = latest.get(q.id);
      return last?.prompt === q.prompt && ['repeat', 'improve'].includes(last.review);
    }).map(q => q.id);
  }

  function card(current) {
    const version = activeInterviewVersion(current);
    const cat = host.state().categories.find(row => row.id === current.categoryId);
    const catColor = cat?.color || '#738176', catIcon = cat?.icon || 'FolderOpen', catName = cat?.name || t('uncategorized');
    const sessionsCount = library().sessions.filter(s => s.interviewId === current.id).length;
    const preparedCount = version.questions.filter(q => q.notes?.trim()).length;
    const areaOrRole = [version.role, version.area].filter(Boolean).join(' · ');
    const metaLabel = [questionCount(version.questions.length), sessionsCount ? tr(sessionsCount === 1 ? 'oneSession' : 'sessionCount', {n: sessionsCount}) : `${preparedCount} resp.`].filter(Boolean).join(' · ');
    return `<article class="speech-card iv-home-card" data-type="interview">${current.pinned ? icon('Pin', 'pin-corner') : ''}<button type="button" class="speech-card-main" data-iv-home="open" data-id="${escape(current.id)}"><div class="card-labels"><span class="item-type">${icon('Mic')}${tr('title')}</span><span class="category-tag"><span class="category-dot" style="color:${escape(catColor)}">${icon(catIcon)}</span>${escape(catName)}</span></div><h3>${escape(current.title)}</h3><p class="card-snippet">${escape(version.questions[0].prompt)}</p>${areaOrRole ? `<span class="card-participants">${escape(areaOrRole)}</span>` : ''}</button><div class="card-foot"><span>${escape(metaLabel)}</span><div class="card-actions"><button type="button" class="icon-btn" data-iv-home="edit" data-id="${escape(current.id)}" aria-label="${tr('edit')}" title="${tr('edit')}">${icon('PenLine')}</button><button type="button" class="icon-btn" data-iv-home="practice" data-id="${escape(current.id)}" aria-label="${tr('startNow')}" title="${tr('startNow')}">${icon('Play')}</button></div></div></article>`;
  }

  function parkCategoryPicker() {
    const picker = document.querySelector('#viewContent .home-category-picker');
    const row = document.querySelector('#viewContent .home-filter-row');
    if (picker && row && picker.parentElement !== row) row.append(picker);
  }

  function placeCategoryPicker() {
    const picker = document.querySelector('#viewContent .home-category-picker');
    const list = document.querySelector('#speechResults');
    if (!picker || !list) return;
    list.querySelector('.home-category-empty-bar')?.remove();
    const firstHead = list.querySelector('.section-head');
    if (firstHead) {
      let right = firstHead.querySelector('.section-head-right');
      if (!right) {
        right = document.createElement('div');
        right.className = 'section-head-right';
        for (const child of [...firstHead.children]) {
          if (child.tagName === 'SPAN') {
            child.classList.add('section-count');
            right.append(child);
          }
        }
        firstHead.append(right);
      }
      right.append(picker);
    } else {
      const bar = document.createElement('div');
      bar.className = 'home-category-empty-bar';
      bar.append(picker);
      list.prepend(bar);
    }
  }

  function renderHome() {
    const filters = document.querySelector('.home-filter-row .type-filters, .type-filters');
    const list = document.querySelector('#speechResults');
    if (!filters || !list) return;
    parkCategoryPicker();
    const {type, category, search, sort} = host.filters();
    if (!filters.querySelector('[data-value="interview"]')) {
      const tab = document.createElement('button');
      tab.type = 'button'; tab.dataset.action = 'type-filter'; tab.dataset.value = 'interview';
      tab.className = `type-filter${type === 'interview' ? ' active' : ''}`;
      tab.setAttribute('aria-pressed', String(type === 'interview'));
      tab.textContent = t('plural');
      filters.append(tab);
      filters.classList.add('iv-type-filters');
    }
    try {
      if (type !== 'all' && type !== 'interview') return;
      list.querySelector('.iv-home-group')?.remove();
      let cards;
      try {
        cards = library().items.filter(row => (category === 'all' || category === 'pinned' && row.pinned || category === row.categoryId)
          && (!search || fold([row.title, ...row.versions.flatMap(v => [v.role, v.area, ...v.questions.map(q => `${q.prompt} ${q.notes}`)])].join(' ')).includes(fold(search))));
      } catch {
        list.insertAdjacentHTML('beforeend', `<section class="iv-home-group">${message('badData')}</section>`);
        return;
      }
      cards.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (sort === 'title' ? a.title.localeCompare(b.title) : b.changedAt - a.changedAt));
      if (type === 'interview' || cards.length && list.querySelector('.empty')) list.replaceChildren();
      if (cards.length || type === 'interview') {
        const countText = cards.length === 1 ? tr('oneItem') : tr('itemsCount', {n: cards.length});
        list.insertAdjacentHTML('beforeend', `<section class="iv-home-group">${cards.length ? `<div class="section-head"><h3>${tr('plural')}</h3><span class="section-count">${countText}</span></div><div class="speech-grid">${cards.map(card).join('')}</div>` : `<div class="empty"><h3>${tr('noResults')}</h3>${button('new', 'create', 'Plus', '', 'data-iv-home="new"')}</div>`}</section>`);
      }
    } finally {
      placeCategoryPicker();
    }
  }

  function afterCreateMenu() {
    const choices = document.querySelector('.modal .sheet-options');
    if (!choices || choices.querySelector('[data-iv-home="new"]')) return;
    choices.insertAdjacentHTML('beforeend', `<div class="creation-option iv-create-option"><button type="button" class="sheet-option" data-iv-home="new" data-creation-kind="interview" data-help-title="${tr('title')}" data-help-detail="${tr('intro')}">${icon('Mic')}<span><strong>${tr('title')}</strong></span>${icon('ChevronRight')}</button><button type="button" class="creation-info" data-creation-help="interview" data-help-title="${tr('title')}" data-help-detail="${tr('intro')}" aria-label="${tr('aboutInterview')}">${icon('Info')}</button></div>`);
  }

  function editorHTML() {
    const current = activeInterviewVersion(draftItem);
    const categories = host.state().categories;
    const versions = draftItem.versions.map(v => option(v.id, v.name, draftItem.activeId)).join('');
    const cat = categories.find(row => row.id === draftItem.categoryId);
    const qs = current.questions;
    const preparedCount = qs.filter(q => q.notes?.trim()).length;
    const wordsTotal = qs.reduce((sum, q) => sum + countWords(q.prompt) + countWords(q.notes), 0);
    const isFreshBlank = qs.length === 1 && !qs[0].prompt.trim() && !qs[0].notes.trim();
    const activeIndex = Math.max(0, qs.findIndex(q => q.id === activeQId));
    const expandedCls = editorExpanded ? ` editor-scrolled${editorToolsHidden ? ' editor-tools-hidden' : ''}${editorFooterHidden ? ' editor-footer-hidden' : ''}` : '';

    return `<main class="editor-shell part-editor interview-editor iv-shell${expandedCls}" data-interview-screen="edit">
      <header class="editor-top">
        <div class="editor-name">
          ${iconButton('back', 'back', 'ArrowLeft')}
          <div>
            <div class="name">${tr('editorHeader')}</div>
            <div class="save-status" id="ivSaveStatus" role="status" aria-live="polite">${draftDirty ? tr('saving') : tr('editorSaved')}</div>
          </div>
        </div>
        <div class="top-actions">
          ${iconButton('editor-menu', 'moreActions', 'MoreHorizontal', `data-id="${escape(draftItem.id)}"`)}
          <button type="button" class="btn editor-save" data-iv-action="save-item" title="${tr(draftDirty ? 'save' : 'presentBtn')}">${icon(draftDirty ? 'Check' : 'Play')}<span>${tr(draftDirty ? 'saveShort' : 'presentBtn')}</span></button>
        </div>
      </header>
      <section class="editor-info">
        <span class="item-type part-type">${icon('Mic')}${tr('title')}</span>
        <textarea id="ivSpeechTitle" class="title-input" data-iv-field="title" rows="1" placeholder="${tr('untitled')}" aria-label="${tr('untitled')}" maxlength="120">${escape(draftItem.title)}</textarea>
        <input class="subtitle-input" data-iv-field="role" placeholder="${tr('rolePlaceholder')}" aria-label="${tr('role')}" value="${escape(current.role)}" maxlength="120">
        <div class="editor-meta">
          <label class="meta-button iv-select-pill" title="${tr('version')}">
            ${icon('Copy')}
            <select data-iv-field="version" aria-label="${tr('version')}">${versions}</select>
            ${icon('ChevronDown')}
          </label>
          <button type="button" class="meta-button" data-iv-action="copy-version" title="${tr('copy')}">${icon('Plus')}<span>${tr('version')}</span></button>
          <label class="meta-button iv-select-pill" title="${tr('category')}">
            ${cat ? `<span class="category-icon" style="color:${escape(cat.color)}">${icon(cat.icon)}</span>` : icon('FolderOpen')}
            <select data-iv-field="categoryId" aria-label="${tr('category')}">${option('', t('uncategorized'), draftItem.categoryId)}${categories.map(r => option(r.id, r.name, draftItem.categoryId)).join('')}</select>
            ${icon('ChevronDown')}
          </label>
          <label class="meta-button iv-select-pill" title="${tr('target')}">
            ${icon('Timer')}
            <select data-iv-field="target" aria-label="${tr('target')}">
              ${[0, 60, 120, 180, 300].map(sec => option(String(sec), sec ? `${sec / 60} ${t('minutesUnit')}` : 'Livre', String(current.targetSec || 0))).join('')}
            </select>
          </label>
          <label class="meta-button iv-select-pill" title="${tr('language')}">
            ${icon('Languages')}
            <select data-iv-field="language" aria-label="${tr('language')}">${interviewLanguages.map((c, i) => option(c, languageNames[i], current.language)).join('')}</select>
          </label>
        </div>
      </section>
      <div class="editor-tools">
        <div class="iv-expanded-bar">
          <button type="button" class="btn small secondary iv-restore-btn" data-iv-action="toggle-editor-expand"${helpAttrs('restoreHeader', 'helpExpand')}>${icon('ChevronDown')}<span>${tr('restoreHeader')}</span></button>
          <span class="tiny muted iv-expanded-count" id="ivExpandedCount">${tr('question')} ${activeIndex + 1} / ${qs.length}</span>
          <button type="button" class="btn small editor-save-mini" data-iv-action="save-item">${icon('Play')}<span>${tr('presentBtn')}</span></button>
        </div>
        <div class="toolbar-wrap"><div class="toolbar" role="toolbar" aria-label="${tr('editorHeader')}">
          <button type="button" class="tool editor-hide-tools-btn" data-iv-action="hide-editor-tools" aria-label="${tr('hideTools')}" title="${tr('hideTools')}"${helpAttrs('hideTools', 'helpHideTools')}>${ICON_HIDE_TOOLS}</button>
          <span class="tool sep editor-hide-tools-sep"></span>
          ${toolButton('add-question', 'newQABtn', 'Plus', '', 'helpAddQ')}
          ${toolButton('question-up', 'up', 'ArrowUp', `data-id="${escape(activeQId)}"${activeIndex <= 0 ? ' disabled' : ''}`, 'helpMoveUp')}
          ${toolButton('question-down', 'down', 'ArrowDown', `data-id="${escape(activeQId)}"${activeIndex >= qs.length - 1 ? ' disabled' : ''}`, 'helpMoveDown')}
          <span class="tool sep"></span>
          ${toolButton('insert-bullets', 'bulletsLabel', 'List', `data-id="${escape(activeQId)}"`, 'helpBullets')}
          ${toolButton('use-points', 'usePoints', 'Target', `data-id="${escape(activeQId)}"${pointsTargets(qs, activeQId).length ? '' : ' aria-disabled="true"'}`, 'helpPoints')}
          ${toolButton('insert-star', 'starChip', 'Star', `data-id="${escape(activeQId)}"`, 'helpStar')}
          <span class="tool sep"></span>
          ${toolButton('remove-question', 'remove', 'Trash2', `data-id="${escape(activeQId)}"${qs.length <= 1 ? ' disabled' : ''}`, 'helpRemoveQ')}
          ${toolButton('toggle-editor-expand', editorExpanded ? 'restoreHeader' : 'expandEditor', editorExpanded ? 'Minimize' : 'Maximize', `aria-pressed="${editorExpanded}"`, 'helpExpand')}
        </div></div>
        <div class="editor-smart-actions-wrap"><div class="editor-smart-actions" role="group" aria-label="${tr('questions')}">
          ${button('library', 'smartQuestions', 'BookOpen', 'small', helpAttrs('addQuestionsBtn', 'helpLibrary'))}
          ${button('auto-modal', 'smartAuto', 'Sparkles', 'small soft', helpAttrs('autoBuildBtn', 'helpAuto'))}
          ${button('recognize-qa', 'smartRecognize', 'ListChecks', 'small secondary', helpAttrs('recognizeQABtn', 'helpRecognize'))}
          ${button('toggle-hints-editor', 'smartHints', 'Lightbulb', `small soft${showEditorHints ? ' active' : ''}`, helpAttrs('hint', 'helpHints'))}
        </div></div>
      </div>
      <div class="scope-bar">
        <span class="scope-state" id="ivScopeLabel">${icon('FileText')}${tr('question')} ${activeIndex + 1} / ${qs.length}</span>
        <button type="button" data-iv-action="toggle-editor-expand">${tr('expandEditor')}</button>
      </div>
      <div class="editor-notices iv-notices"></div>
      <div class="editor-scroll">
        <article class="editor-page iv-editor-page">
          ${isFreshBlank ? `<section class="iv-starter-banner">
            <div class="iv-starter-head"><strong>${tr('starterTitle')}</strong></div>
            <div class="iv-starter-actions">
              ${button('auto-modal', 'starterQuickAuto', 'Sparkles', '', helpAttrs('autoBuildBtn', 'helpAuto'))}
              ${button('library', 'starterPickAreas', 'BookOpen', 'secondary', helpAttrs('addQuestionsBtn', 'helpLibrary'))}
            </div>
          </section>` : ''}
          <div class="iv-doc-list">
            ${qs.map((q, i) => `
              <section class="iv-doc-pair${q.id === activeQId ? ' is-focused' : ''}" data-id="${escape(q.id)}">
                <div class="iv-doc-turn iv-doc-question">
                  <div class="iv-doc-turn-head">
                    <span class="speaker-label iv-speaker-q">${tr('qHeader', {n: i + 1})}</span>
                    <div class="iv-doc-turn-tools">
                      ${iconButton('replace-q', 'swapQuestion', 'RotateCcw', `data-id="${escape(q.id)}"${helpAttrs('swapQuestion', 'helpSwap')}`, 'iv-mini-tool')}
                    </div>
                  </div>
                  <textarea class="iv-doc-input iv-doc-prompt" data-iv-field="prompt" data-id="${escape(q.id)}" rows="1" maxlength="600" placeholder="${tr('promptPlaceholder')}" aria-label="${tr('qHeader', {n: i + 1})}">${escape(q.prompt)}</textarea>
                </div>
                <div class="iv-doc-turn iv-doc-answer">
                  <div class="iv-doc-turn-head">
                    <span class="speaker-label iv-speaker-a">${tr('aHeader')}<span>${tr('probableTag')}</span></span>
                  </div>
                  <textarea class="iv-doc-input iv-doc-answer-input" data-iv-field="notes" data-id="${escape(q.id)}" rows="2" maxlength="800" placeholder="${tr('answerPlaceholder')}" aria-label="${tr('aHeader')}">${escape(q.notes)}</textarea>
                  ${showEditorHints || q.hint ? `<div class="iv-doc-hint-row"><span class="iv-hint-tag">${tr('hint')}:</span><input type="text" class="iv-doc-hint-input" data-iv-field="hint" data-id="${escape(q.id)}" maxlength="360" placeholder="${tr('hintPlaceholder')}" value="${escape(q.hint)}"></div>` : ''}
                </div>
              </section>
            `).join('')}
          </div>
          <div class="iv-doc-add-bar">
            ${button('add-question', 'newQABtn', 'Plus', 'small secondary', helpAttrs('newQABtn', 'helpAddQ'))}
          </div>
        </article>
      </div>
      <footer class="editor-status" ${editorExpanded && editorFooterHidden ? 'hidden' : ''}>
        <span id="ivFooterStats">${tr('footerStats', {q: qs.length, a: preparedCount, w: wordsTotal})}</span>
        <button type="button" class="meta-button" data-iv-action="save-item">${icon('Play')}<span>${tr('presentBtn')}</span></button>
        <button type="button" class="editor-footer-close" data-iv-action="dismiss-editor-footer" aria-label="${tr('hideFooter')}" title="${tr('hideFooter')}"${editorExpanded ? '' : ' hidden'}>${icon('X')}</button>
      </footer>
      <button type="button" class="editor-restore-tools-btn" data-iv-action="show-editor-tools" aria-label="${tr('showTools')}" title="${tr('showTools')}">${ICON_SHOW_TOOLS}</button>
    </main>`;
  }

  function readerHTML(current) {
    const version = activeInterviewVersion(current);
    const activeRow = session();
    const isSessionHere = activeRow && activeRow.interviewId === current.id;
    const isRunning = isSessionHere && activeRow.status !== 'done' && ['preparing', 'asking', 'answering'].includes(phase);
    const isPaused = isSessionHere && activeRow.status === 'paused' && phase === 'paused';
    const isDone = isSessionHere && ['done', 'partial'].includes(activeRow.status) && phase === 'idle';
    const qs = isSessionHere ? activeRow.questions : version.questions;
    const displayLanguage = isSessionHere ? activeRow.language : version.language;
    const history = library().sessions.filter(s => s.interviewId === current.id).sort((a, b) => b.createdAt - a.createdAt);
    const flagged = flaggedQuestions(version, history);
    const areaName = version.area || t('title');
    const preparedCount = version.questions.filter(q => q.notes?.trim()).length;

    let primaryAction = 'start-direct', primaryIcon = 'Play', primaryLabel = 'startInteractive';
    if (isPaused) {primaryAction = 'resume'; primaryIcon = 'Play'; primaryLabel = 'resume';}
    else if (phase === 'asking') {primaryAction = 'answer-now'; primaryIcon = 'Mic'; primaryLabel = 'answerNow';}
    else if (phase === 'answering') {primaryAction = 'done'; primaryIcon = 'Check'; primaryLabel = 'done';}

    const sSec = config.silenceSeconds || 3;
    let rehearsalBar = '';
    if ((isRunning || isPaused) && activeRow) {
      const answeredCount = activeRow.cursor + 1;
      const barState = phase === 'asking' ? 'narrating' : phase === 'paused' ? 'paused' : config.autoMic ? 'listening' : 'waiting-user';
      const statusKey = phase === 'preparing' ? 'preparingMic' : phase === 'asking' ? 'askingStatus' : phase === 'paused' ? 'paused' : config.autoMic ? 'answeringAutoStatus' : 'answeringManualStatus';
      const micActiveText = recorder?.isRecording() && phase === 'answering' ? t('recording') : config.autoMic && phase === 'answering' ? t('waitingVoice', {s: sSec}) : '';
      rehearsalBar = `<section class="rehearsal-bar iv-rehearsal-live" aria-label="${tr('interactiveBtn')}">
        <div class="rehearsal-bar-top">
          <div class="rehearsal-status-group">
            <div class="iv-live-status-left">
              <span class="rehearsal-status-badge" data-state="${barState}">${tr(statusKey)}</span>
              <span class="rehearsal-turn-counter">${tr('count', {n: Math.min(answeredCount, activeRow.questions.length), total: activeRow.questions.length})} · <strong class="mono" data-iv-clock>${clock(elapsed())}</strong></span>
            </div>
            <div class="iv-live-mode-controls">
              <button type="button" class="iv-live-mode-pill${config.autoMic ? ' is-auto' : ''}" data-iv-action="toggle-auto-mic" aria-pressed="${config.autoMic}"${helpAttrs(config.autoMic ? 'switchToManual' : 'switchToAuto', 'helpAutoMic')}>${icon('Mic')}<span>${config.autoMic ? tr('liveAutoChip', {s: sSec}) : tr('liveManualChip')}</span></button>
              ${config.autoMic ? `<button type="button" class="iv-live-silence-pill" data-iv-action="cycle-silence" title="${tr('pauseTolerance')}"${helpAttrs('pauseTolerance', 'autoMicHelp')}><span>${sSec}s</span></button>` : ''}
            </div>
          </div>
          ${micActiveText || (config.autoMic && phase === 'answering') ? `<div class="rehearsal-mic-status iv-mic-status" role="status">
            ${config.autoMic && phase === 'answering' ? `<span class="rehearsal-mic-meter"><span class="rehearsal-mic-meter-fill" id="ivVadMeterFill"></span></span><span id="ivVadStatusText">${escape(micActiveText || t('waitingVoice', {s: sSec}))}</span>` : icon('Mic') + `<span>${escape(micActiveText)}</span>`}
          </div>` : ''}
        </div>
        <div class="rehearsal-actions-row">
          <button type="button" class="rehearsal-primary-btn" data-iv-action="${phase === 'paused' ? 'resume' : phase === 'asking' ? 'answer-now' : 'done'}">${icon(phase === 'asking' ? 'Mic' : phase === 'paused' ? 'Play' : 'Check')}<span>${tr(phase === 'asking' ? 'answerNow' : phase === 'paused' ? 'resume' : 'done')}</span></button>
          ${iconButton('hear', 'hear', 'Volume2', helpAttrs('hear', 'helpVoice'), 'rehearsal-icon-action')}
          ${iconButton('skip', 'skip', 'ArrowRight', '', 'rehearsal-icon-action')}
          ${phase !== 'paused' ? iconButton('pause', 'pause', 'Pause', '', 'rehearsal-icon-action') : ''}
          ${iconButton('finish', 'finish', 'Square', '', 'rehearsal-icon-action iv-finish-icon')}
        </div>
      </section>`;
    }

    let summaryHTML = '';
    if (isDone && activeRow) {
      const ans = activeRow.attempts.filter(a => a.result === 'answered').length;
      const skp = activeRow.attempts.length - ans;
      const flaggedNow = activeRow.attempts.filter(a => ['repeat', 'improve'].includes(a.review)).length + repeatSelection.size;
      summaryHTML = `<section class="iv-session-summary-card">
        <div class="iv-summary-head">
          <div>
            <div class="eyebrow">${tr('summary')}</div>
            <h2>${escape(activeRow.versionName)}</h2>
          </div>
          <div class="iv-summary-actions">
            ${flagged.length || repeatSelection.size ? button('repeat-selected', 'repeatSelected', 'RotateCcw', 'small') : ''}
            ${button('prepare', 'startInteractive', 'Play', 'small secondary', helpAttrs('interactiveBtn', 'helpInteractive'))}
          </div>
        </div>
        <div class="iv-summary-counts">
          <div><strong>${ans}</strong><span>${tr('answered')}</span></div>
          <div><strong>${skp}</strong><span>${tr('skipped')}</span></div>
          <div><strong>${flaggedNow}</strong><span>${tr('repeat')}</span></div>
        </div>
      </section>`;
    }

    const turnsHTML = qs.map((q, i) => {
      const isCurrent = (isRunning || isPaused) && activeRow && activeRow.cursor === i;
      const attempts = isSessionHere ? activeRow.attempts.filter(a => a.questionId === q.id) : [];
      const latestAttempt = attempts.at(-1);
      const shouldMask = (isRunning || isPaused) && (config.hideAnswers || config.mode === 'simulation') && !(isCurrent && hintOpen);
      const badgeResult = latestAttempt ? (latestAttempt.result === 'answered' ? tr('answeredBadge', {time: clock(latestAttempt.elapsedMs)}) : tr('skippedBadge')) : '';

      return `<div class="iv-reader-pair">
        <section class="reading-turn iv-turn-question${isCurrent && phase === 'asking' ? ' is-rehearsal-current is-rehearsal-other' : ''}">
          <header class="speaker-label">
            ${tr('qHeader', {n: i + 1})}
            ${isCurrent && phase === 'asking' ? `<span class="rehearsal-turn-tag">${tr('reading')}</span>` : ''}
            ${badgeResult ? `<span class="badge">${badgeResult}</span>` : ''}
          </header>
          <div class="reading-turn-body"><p lang="${displayLanguage}"${isCurrent ? ' data-iv-prompt tabindex="-1"' : ''}>${escape(q.prompt)}</p></div>
          <div class="iv-turn-actions">
            <button type="button" class="btn small link" data-iv-action="hear-question" data-index="${i}">${icon('Volume2')}<span>${tr('hear')}</span></button>
            ${!(isRunning || isPaused) ? `<button type="button" class="btn small link" data-iv-action="start-from" data-index="${i}">${icon('Play')}<span>${tr('trainFromHere')}</span></button>` : ''}
          </div>
        </section>
        <section class="reading-turn mine iv-turn-answer${isCurrent && phase !== 'asking' ? ' is-rehearsal-current is-rehearsal-mine' : ''}">
          <header class="speaker-label">
            ${tr('aHeader')}
            <span>${tr('probableTag')}</span>
            ${isCurrent && phase !== 'asking' ? `<span class="rehearsal-turn-tag">${tr('yourTurn')}</span>` : ''}
          </header>
          ${shouldMask ? `<div class="rehearsal-memorization-box">
            <p class="rehearsal-memorization-note">${tr('maskedNote')}</p>
            ${button('hint', 'revealAnswer', 'Lightbulb', 'small soft')}
          </div>` : `<div class="reading-turn-body">${q.notes?.trim() ? `<p lang="${displayLanguage}">${escape(q.notes)}</p>` : `<p class="iv-muted-inline">${tr('freeAnswer')}</p>`}</div>
          ${(config.mode === 'guided' || (isCurrent && hintOpen)) && (q.hint || q.reference) ? `<div class="iv-hint-box"><strong>${tr('hint')}:</strong> <span>${escape(q.hint || q.reference)}</span></div>` : ''}`}
          ${attempts.length ? `<div class="iv-attempt-bar">${attempts.map(a => `<div class="iv-attempt" data-attempt="${escape(a.id)}">
            ${a.audioSegments.length ? `<div class="iv-audio-clips">${a.audioSegments.map((_, segIdx) => button('listen', a.audioSegments.length === 1 ? 'recordReview' : 'playPart', 'Play', 'small secondary', `data-id="${escape(a.id)}" data-segment="${segIdx}"`, {n: segIdx + 1})).join('')}</div><div class="iv-clip" aria-live="polite"></div>` : ''}
            <div class="iv-quick-reviews" role="group" aria-label="${tr('selfReview')}">
              ${['clear', 'improve', 'repeat'].map(rk => `<button type="button" class="chip iv-review-pill${a.review === rk ? ' active' : ''}" data-iv-action="quick-review" data-id="${escape(a.id)}" data-review="${rk}" aria-pressed="${a.review === rk}">${tr(rk)}</button>`).join('')}
            </div>
            <label class="check-label iv-repeat-check"><input type="checkbox" data-iv-repeat="${escape(q.id)}"${repeatSelection.has(q.id) ? ' checked' : ''}><span>${tr('repeatSelect')}</span></label>
          </div>`).join('')}</div>` : ''}
        </section>
      </div>`;
    }).join('');

    const historyDrawer = history.length ? `<details class="iv-history-drawer">
      <summary>${tr('history')} (${history.length})</summary>
      <div class="iv-history-list">${history.slice(0, 6).map(h => {
        const dt = new Intl.DateTimeFormat(host.state().settings.language, {dateStyle: 'short', timeStyle: 'short'}).format(h.createdAt);
        const cnt = h.attempts.filter(a => a.result === 'answered').length;
        return `<div class="iv-history-item">
          <div><strong>${escape(dt)}</strong><small>${escape(h.versionName)} · ${tr('count', {n: cnt, total: h.questions.length})}</small></div>
          <button type="button" class="btn small secondary" data-iv-action="open-history-session" data-id="${escape(h.id)}">${tr(h.status === 'done' ? 'review' : 'resume')}</button>
        </div>`;
      }).join('')}</div>
    </details>` : '';

    return `<main class="reader-shell interview-reader-shell iv-shell" data-interview-screen="reader">
      <header class="reader-top">
        <div class="row">
          ${iconButton('back', 'back', 'ArrowLeft')}
          <span class="badge">${tr('readerLabel')} · ${tr('title')}</span>
        </div>
        <div class="top-actions">
          ${iconButton('edit', 'edit', 'PenLine')}
          ${iconButton('prepare', 'moreOptions', 'SlidersHorizontal', helpAttrs('moreOptions', 'helpReaderSettings'))}
          ${iconButton('toggle-focus', 'focus', focusMode ? 'Minimize' : 'Maximize')}
        </div>
      </header>
      <div class="reader-sidebar">
        <section class="reader-heading">
          <div class="reader-type-row">
            <span class="item-type part-type">${icon('Mic')}${tr('title')}</span>
            <div class="eyebrow">${escape(areaName)} · ${questionCount(version.questions.length)}</div>
          </div>
          <h1 tabindex="-1">${escape(current.title)}</h1>
          ${version.role ? `<p>${escape(version.role)}</p>` : ''}
          <div class="row reader-meta">
            <label class="meta-button content-version-selector iv-select-pill">
              ${icon('Copy')}
              <select data-iv-field="active-version" aria-label="${tr('version')}">${current.versions.map(v => option(v.id, v.name, current.activeId)).join('')}</select>
              ${icon('ChevronDown')}
            </label>
            <button type="button" class="meta-button reader-share" data-iv-action="export">${icon('Share2')}<span>${tr('export')}</span></button>
            <button type="button" class="meta-button" data-iv-action="delete-item">${icon('Trash2')}<span>${tr('deleteItem')}</span></button>
            <span class="badge">${preparedCount}/${version.questions.length} ${tr('probableTag')}</span>
            ${flagged.length ? button('flagged', 'repeatMarked', 'RotateCcw', 'small soft') : ''}
          </div>
        </section>
        <div class="reader-identity">
          <span>${tr('readerIdentity')}</span>
          <div class="reader-identity-actions">
            <button type="button" class="btn small secondary" data-iv-action="toggle-hide-answers" aria-pressed="${config.hideAnswers}">${icon(config.hideAnswers ? 'CheckCircle2' : 'BookOpen')}<span>${tr(config.hideAnswers ? 'showAnswers' : 'hideAnswers')}</span></button>
            <div class="iv-mode-switch" role="group" aria-label="${tr('interactiveBtn')}">
              <button type="button" class="iv-mode-switch-btn${!config.autoMic ? ' is-selected' : ''}" data-iv-action="reader-mode-switch" data-value="false" aria-pressed="${!config.autoMic}">${tr('switchManualLabel')}</button>
              <button type="button" class="iv-mode-switch-btn${config.autoMic ? ' is-selected' : ''}" data-iv-action="reader-mode-switch" data-value="true" aria-pressed="${config.autoMic}"${helpAttrs('autoMicMode', 'helpAutoMic')}>${icon('Mic')}<span>${tr('switchAutoLabel')}</span></button>
            </div>
          </div>
        </div>
        ${!(isRunning || isPaused) ? `<section class="reader-controls">
          <div class="reader-primary-timer">
            <button type="button" class="start-reading" data-iv-action="${primaryAction}"${helpAttrs('interactiveBtn', 'helpInteractive')}><span>${icon(primaryIcon)}</span><span>${tr(primaryLabel)}</span></button>
          </div>
          <div class="reader-subtools">
            <button type="button" class="btn secondary${config.voice ? ' is-on' : ''}" data-iv-action="toggle-voice" aria-pressed="${config.voice}"${helpAttrs('voiceLabelShort', 'helpVoice')}>${icon('Volume2')}<span>${tr('voiceLabelShort')}</span></button>
            <button type="button" class="btn secondary${config.record ? ' is-on' : ''}" data-iv-action="toggle-record" aria-pressed="${config.record}"${helpAttrs('recordLabelShort', 'helpRecord')}>${icon('History')}<span>${tr('recordLabelShort')}</span></button>
            <button type="button" class="btn secondary${config.surprise ? ' is-on' : ''}" data-iv-action="toggle-surprise" aria-pressed="${config.surprise}"${helpAttrs('surpriseLabelShort', 'helpSurprise')}>${icon('RotateCcw')}<span>${tr('surpriseLabelShort')}</span></button>
          </div>
        </section>` : ''}
      </div>
      <div class="reader-main">
        <div class="iv-notices iv-reader-notices"></div>
        ${rehearsalBar}
        <article class="reader-paper">
          <div class="reader-text" id="readerText">
            ${summaryHTML}
            ${turnsHTML}
          </div>
          ${historyDrawer}
        </article>
      </div>
      ${focusMode ? `<button type="button" class="focus-exit" data-iv-action="toggle-focus" aria-label="${tr('close')}">${icon('Minimize')}</button>` : ''}
    </main>`;
  }

  function renderAddModalBody() {
    const version = activeInterviewVersion(draftItem || item());
    const lang = version?.language || defaultLanguage();
    const qs = interviewQuestions(pack, lang);
    const totalPicked = selectedBankKeys.size;
    const countInPack = p => [...selectedBankKeys].filter(k => k.startsWith(`${p}:`)).length;

    const browseHTML = `<div class="iv-modal-section">
      <div class="field iv-area-picker">
        <label>${tr('browseAreaLabel')}</label>
        <button type="button" class="iv-area-trigger" data-iv-action="toggle-area-dropdown" aria-expanded="${areaDropdownOpen}">
          <span class="iv-area-trigger-main">${icon(packIcons[pack] || 'FolderOpen')}<span>${tr(pack)}</span>${countInPack(pack) ? `<span class="iv-area-count-badge">${countInPack(pack)}</span>` : ''}</span>
          ${icon('ChevronDown')}
        </button>
        ${totalPicked ? `<div class="iv-picked-summary">${tr('pickedAcrossAreas', {n: totalPicked})}</div>` : ''}
        ${areaDropdownOpen ? `<div class="iv-area-dropdown" role="listbox" aria-label="${tr('browseAreaLabel')}">
          <div class="iv-area-options">
            ${interviewPacks.map(k => {
              const c = countInPack(k);
              return `<button type="button" class="iv-area-option${pack === k ? ' is-selected' : ''}" data-iv-action="pick-pack" data-pack="${k}" aria-selected="${pack === k}">
                <span class="iv-area-option-left">${icon(packIcons[k] || 'Mic')}<span>${tr(k)}</span></span>
                <span class="iv-area-option-right">${c ? `<span class="badge">${c}</span>` : ''}<span class="iv-area-check">${pack === k ? icon('Check') : ''}</span></span>
              </button>`;
            }).join('')}
          </div>
        </div>` : ''}
      </div>
      ${replacingQId ? '' : `<label class="check-label"><input type="checkbox" data-iv-field="all-library"><span>${tr('selectAllArea')}</span></label>`}
      <div class="iv-bank-list">
        ${(() => {
          const rank = {levelBasic: 0, levelPractical: 1, levelComplex: 2};
          return qs.map((q, origIdx) => ({q, origIdx, lvl: levelKeyFor(q, pack, origIdx)}))
            .sort((a, b) => (rank[a.lvl] ?? 1) - (rank[b.lvl] ?? 1) || a.origIdx - b.origIdx)
            .map(({q, origIdx, lvl}) => {
              const key = `${pack}:${origIdx}`;
              if (replacingQId) {
                return `<button type="button" class="iv-bank-card" data-iv-action="pick-replacement" data-index="${origIdx}">
                  <div class="iv-bank-card-top"><span class="badge">${tr(lvl)}</span></div>
                  <strong>${escape(q.prompt)}</strong>
                  ${q.reference ? `<small>${escape(q.reference)}</small>` : ''}
                </button>`;
              }
              return `<label class="iv-bank-card${selectedBankKeys.has(key) ? ' is-selected' : ''}">
                <input type="checkbox" data-iv-pick="${origIdx}" data-iv-pick-key="${key}"${selectedBankKeys.has(key) ? ' checked' : ''}>
                <div>
                  <div class="iv-bank-card-top"><span class="badge">${tr(lvl)}</span></div>
                  <strong>${escape(q.prompt)}</strong>
                  ${q.reference ? `<small>${escape(q.reference)}</small>` : ''}
                </div>
              </label>`;
            }).join('');
        })()}
      </div>
      ${replacingQId ? '' : `<label class="check-label iv-prefill-check"><input type="checkbox" data-iv-field="prefill-points"${prefillPoints ? ' checked' : ''}><span>${tr('prefillPointsCheck')}</span></label>`}
    </div>`;

    const chosenAuto = [...autoPacks].filter(k => interviewPacks.includes(k));
    const autoSummaryLabel = chosenAuto.length === 0
      ? tr('selectAreasPrompt')
      : chosenAuto.length === 1
        ? tr(chosenAuto[0])
        : chosenAuto.length === 2
          ? `${tr(chosenAuto[0])}, ${tr(chosenAuto[1])}`
          : tr('areasSelectedCount', {n: chosenAuto.length});
    const preview = buildAutomaticScript(autoPacks, autoDepth, lang, autoSeed, prefillPoints);
    const autoHTML = `<div class="iv-modal-section">
      <div class="field iv-area-picker">
        <label>${tr('autoAreasLabel')}</label>
        <button type="button" class="iv-area-trigger" data-iv-action="toggle-area-dropdown" aria-expanded="${areaDropdownOpen}">
          <span class="iv-area-trigger-main">${icon(chosenAuto.length === 1 ? (packIcons[chosenAuto[0]] || 'FolderOpen') : 'FolderOpen')}<span>${autoSummaryLabel}</span><span class="iv-area-count-badge">${chosenAuto.length}</span></span>
          ${icon('ChevronDown')}
        </button>
        ${!areaDropdownOpen && chosenAuto.length > 1 ? `<div class="iv-selected-chips">
          ${chosenAuto.map(k => `<button type="button" class="iv-selected-chip" data-iv-action="toggle-auto-pack" data-pack="${k}" aria-label="${tr('remove')} ${tr(k)}"><span>${tr(k)}</span>${icon('X')}</button>`).join('')}
        </div>` : ''}
        ${areaDropdownOpen ? `<div class="iv-area-dropdown" role="group" aria-label="${tr('autoAreasLabel')}">
          <div class="iv-area-dropdown-head">
            <span class="tiny muted">${tr('areasSelectedCount', {n: chosenAuto.length})}</span>
            <div class="iv-area-dropdown-actions">
              <button type="button" class="btn small link" data-iv-action="select-all-auto-packs">${tr('selectAllAreas')}</button>
              <button type="button" class="btn small link" data-iv-action="clear-auto-packs">${tr('clearAreas')}</button>
              <button type="button" class="btn small soft" data-iv-action="toggle-area-dropdown">${tr('doneSelecting')}</button>
            </div>
          </div>
          <div class="iv-area-options">
            ${interviewPacks.map(k => {
              const checked = autoPacks.has(k);
              return `<button type="button" class="iv-area-option${checked ? ' is-selected' : ''}" data-iv-action="toggle-auto-pack" data-pack="${k}" aria-pressed="${checked}">
                <span class="iv-area-option-left">${icon(packIcons[k] || 'Mic')}<span>${tr(k)}</span></span>
                <span class="iv-area-option-right"><span class="iv-area-check">${checked ? icon('Check') : ''}</span></span>
              </button>`;
            }).join('')}
          </div>
        </div>` : ''}
      </div>
      <div class="field">
        <label>${tr('autoDepthLabel')}</label>
        <div class="iv-depth-row">
          <div class="iv-depth-segment" role="group">
            ${[4, 6, 8].map(n => `<button type="button" class="iv-depth-btn${autoDepth === n ? ' active' : ''}" data-iv-action="set-auto-depth" data-depth="${n}" aria-pressed="${autoDepth === n}">${tr(`depth${n}`)}</button>`).join('')}
          </div>
          <button type="button" class="btn small soft iv-shuffle-btn" data-iv-action="shuffle-auto" title="${tr('shuffleRoute')}">${icon('RotateCcw')}<span>${tr('shuffleShort')}</span></button>
        </div>
      </div>
      <ol class="iv-auto-preview">
        ${preview.map((q, idx) => `<li><span class="badge">${idx + 1} · ${tr(q._level || q.level || (idx < 2 ? 'levelBasic' : idx < preview.length - 2 ? 'levelPractical' : 'levelComplex'))}</span><span>${escape(q.prompt)}</span></li>`).join('')}
      </ol>
      <label class="check-label"><input type="checkbox" data-iv-field="prefill-points"${prefillPoints ? ' checked' : ''}><span>${tr('prefillPointsCheck')}</span></label>
      ${activeInterviewVersion(draftItem)?.questions.some(q => q.prompt.trim()) ? `<div class="iv-auto-replace-row">
        <label class="check-label"><input type="radio" name="ivAutoMode" data-iv-field="auto-replace" value="replace"${autoReplace ? ' checked' : ''}><span>${tr('autoReplace')}</span></label>
        <label class="check-label"><input type="radio" name="ivAutoMode" data-iv-field="auto-replace" value="append"${!autoReplace ? ' checked' : ''}><span>${tr('autoAppend')}</span></label>
      </div>` : ''}
    </div>`;

    const tabs = replacingQId ? '' : `<div class="type-filters iv-modal-tabs" role="tablist">
      <button type="button" class="type-filter${modalTab === 'browse' ? ' active' : ''}" data-iv-action="modal-tab" data-tab="browse" role="tab" aria-selected="${modalTab === 'browse'}">${tr('tabBrowse')}</button>
      <button type="button" class="type-filter${modalTab === 'auto' ? ' active' : ''}" data-iv-action="modal-tab" data-tab="auto" role="tab" aria-selected="${modalTab === 'auto'}">${tr('tabAuto')}</button>
    </div>`;

    const footerHTML = modalTab === 'auto'
      ? button('apply-auto', 'buildAutoBtn', 'Sparkles', '')
      : replacingQId ? '' : `<button type="button" class="btn" data-iv-action="add-selected"${totalPicked ? '' : ' disabled'}>${icon('Plus')}<span>${tr('insertSelectedBtn', {n: totalPicked})}</span></button>`;

    return {
      title: replacingQId ? tr('replaceQ') : tr('addQuestionsBtn'),
      body: `${tabs}${modalTab === 'auto' ? autoHTML : browseHTML}`,
      footer: footerHTML,
      wide: true,
    };
  }

  function renderPrepareModal() {
    const silenceLabels = {2: tr('silenceFast'), 3: tr('silenceStandard'), 5: tr('silencePatient')};
    return {
      title: tr('moreOptions'),
      body: `<div class="stack">
        <div class="field">
          <label>${tr('readerIdentity')}</label>
          <div class="rehearsal-mode-cards" role="radiogroup">
            <label class="rehearsal-mode-card${config.autoMic ? ' is-selected' : ''}" data-iv-action="set-auto-mic" data-value="true">
              <input type="radio" name="ivAutoMic" value="true"${config.autoMic ? ' checked' : ''}>
              <span><strong>${tr('autoMicMode')}</strong><small>${tr('autoMicHelp')}</small></span>
            </label>
            <label class="rehearsal-mode-card${!config.autoMic ? ' is-selected' : ''}" data-iv-action="set-auto-mic" data-value="false">
              <input type="radio" name="ivAutoMic" value="false"${!config.autoMic ? ' checked' : ''}>
              <span><strong>${tr('manualMode')}</strong><small>${tr('manualHelp')}</small></span>
            </label>
          </div>
        </div>
        ${config.autoMic ? `<div class="field">
          <label>${tr('pauseTolerance')}</label>
          <div class="rehearsal-silence-group">${[2, 3, 5].map(s => `<button type="button" class="rehearsal-silence-pill" data-iv-action="set-silence" data-seconds="${s}" aria-pressed="${config.silenceSeconds === s}">${s} s<small>${silenceLabels[s]}</small></button>`).join('')}</div>
          <small class="iv-pause-help">${tr('pauseHelp')}</small>
        </div>` : ''}
        <div class="field">
          <label>${tr('autoPanelStyle')}</label>
          <div class="iv-modes" role="radiogroup" aria-label="${tr('autoPanelStyle')}">
            ${['guided', 'simulation'].map(m => `<label class="iv-mode"><input type="radio" name="ivPracticeMode" data-iv-option="mode" value="${m}"${config.mode === m ? ' checked' : ''}><span><strong>${tr(m)}</strong><small>${tr(`${m}Help`)}</small></span></label>`).join('')}
          </div>
        </div>
        <label class="check-label"><input type="checkbox" data-iv-option="voice"${config.voice ? ' checked' : ''}><span>${tr('voice')}</span></label>
        <label class="check-label"><input type="checkbox" data-iv-option="hideAnswers"${config.hideAnswers ? ' checked' : ''}><span>${tr('hideAnswers')}</span></label>
        <label class="check-label"><input type="checkbox" data-iv-option="record"${config.record ? ' checked' : ''}><span>${tr('record')}</span></label>
        <label class="check-label"><input type="checkbox" data-iv-option="surprise"${config.surprise ? ' checked' : ''}><span>${tr('surprise')}</span></label>
      </div>`,
      footer: button('close-modal', 'close', '', 'secondary') + button('start', 'startInteractive', 'Play', ''),
      wide: false,
    };
  }

  function renderModal() {
    const slot = overlays();
    if (!slot) return;
    if (!modal) {
      if (slot.querySelector('.iv-modal-backdrop')) slot.replaceChildren();
      return;
    }
    let spec;
    if (modal.type === 'library') spec = renderAddModalBody();
    else if (modal.type === 'prepare') spec = renderPrepareModal();
    else if (modal.type === 'confirm') spec = {
      title: modal.title,
      body: `<p class="help">${escape(modal.message)}</p>`,
      footer: button('close-modal', 'cancel', '', 'secondary') + button(modal.action, modal.confirmLabel, modal.icon || 'Check', modal.danger ? 'danger' : ''),
      wide: false,
    };
    else if (modal.type === 'editor-menu') spec = {
      title: tr('editorHeader'),
      body: `<div class="sheet-options">
        <button type="button" class="sheet-option" data-iv-action="present-from-menu">${icon('Play')}<span><strong>${tr('presentBtn')}</strong></span>${icon('ChevronRight')}</button>
        <button type="button" class="sheet-option" data-iv-action="pin-draft">${icon('Pin')}<span><strong>${tr(draftItem.pinned ? 'unpin' : 'pin')}</strong></span>${icon('ChevronRight')}</button>
        ${draftItem.versions.length > 1 ? `<button type="button" class="sheet-option danger" data-iv-action="delete-version">${icon('Trash2')}<span><strong>${tr('deleteVersion')}</strong></span>${icon('ChevronRight')}</button>` : ''}
        ${itemId ? `<button type="button" class="sheet-option danger" data-iv-action="delete-item">${icon('Trash2')}<span><strong>${tr('deleteItem')}</strong></span>${icon('ChevronRight')}</button>` : ''}
      </div>`,
      footer: '',
      wide: false,
    };
    else if (modal.type === 'import' && importedItem) spec = {
      title: tr('import'),
      body: `<div class="incoming-heading"><span class="item-type">${icon('Mic')}${tr('title')}</span><h3>${escape(importedItem.title)}</h3><p>${questionCount(activeInterviewVersion(importedItem).questions.length)}</p></div>`,
      footer: button('close-modal', 'cancel', '', 'secondary') + button('accept-import', 'import', 'Download', ''),
      wide: false,
    };
    if (!spec) {slot.replaceChildren(); clearContextHelp(); return;}
    slot.innerHTML = `<div class="modal-backdrop iv-modal-backdrop"><section class="modal${spec.wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="ivModalTitle"><header class="modal-head"><h2 id="ivModalTitle">${escape(spec.title)}</h2>${iconButton('close-modal', 'close', 'X')}</header><div class="modal-body">${spec.body}</div>${spec.footer ? `<footer class="modal-footer">${spec.footer}</footer>` : ''}</section></div>`;
    clearContextHelp();
  }

  function closeIvModal() {
    const wasPrepare = modal?.type === 'prepare';
    areaDropdownOpen = false;
    modal = null;
    renderModal();
    if (wasPrepare && screen === 'reader') render(false);
  }

  function syncEditorExpandedDom(shell = screenRoot()) {
    if (!shell || !shell.classList.contains('interview-editor')) return;
    shell.classList.toggle('editor-scrolled', editorExpanded);
    shell.classList.toggle('editor-tools-hidden', editorExpanded && editorToolsHidden);
    shell.classList.toggle('editor-footer-hidden', editorExpanded && editorFooterHidden);
    const footer = shell.querySelector('.editor-status');
    const close = footer?.querySelector('[data-iv-action="dismiss-editor-footer"]');
    const expandTool = shell.querySelector('.toolbar [data-iv-action="toggle-editor-expand"]');
    if (footer) footer.hidden = Boolean(editorExpanded && editorFooterHidden);
    if (close) close.hidden = !editorExpanded;
    if (expandTool) {
      expandTool.setAttribute('aria-pressed', String(editorExpanded));
      const label = t(editorExpanded ? 'restoreHeader' : 'expandEditor');
      expandTool.setAttribute('aria-label', label);
      expandTool.setAttribute('title', label);
      expandTool.dataset.helpTitle = label;
      expandTool.innerHTML = icon(editorExpanded ? 'Minimize' : 'Maximize');
    }
  }

  function setEditorExpanded(next) {
    const value = Boolean(next);
    if (value === editorExpanded) return;
    editorExpanded = value;
    if (!editorExpanded) {
      editorToolsHidden = false;
      editorFooterHidden = false;
    }
    syncEditorExpandedDom();
  }

  function setEditorToolsHidden(next) {
    const value = Boolean(next) && editorExpanded;
    if (value === editorToolsHidden) return;
    editorToolsHidden = value;
    clearContextHelp();
    syncEditorExpandedDom();
  }

  function attachEditorScroll(shell) {
    disposeEditorScroll();
    disposeEditorScroll = () => {};
    const editorScroll = shell?.querySelector('.editor-scroll');
    if (!editorScroll || !shell) return;
    let lastScrollTop = editorScroll.scrollTop;
    const revealHeader = () => {
      if (editorScroll.scrollTop > 2) return;
      if (editorToolsHidden) setEditorToolsHidden(false);
      else setEditorExpanded(false);
    };
    const onScroll = () => {
      const st = editorScroll.scrollTop;
      if (st > 12 && st > lastScrollTop && !editorExpanded) setEditorExpanded(true);
      lastScrollTop = st;
    };
    let pullStartY = 0, pullEligible = false, pullDistance = 0;
    const onTouchStart = e => {
      pullStartY = e.touches[0]?.clientY ?? 0;
      pullEligible = editorExpanded && editorScroll.scrollTop <= 2;
      pullDistance = 0;
    };
    const onTouchMove = e => {
      if (!pullEligible) return;
      pullDistance = Math.max(pullDistance, (e.touches[0]?.clientY ?? pullStartY) - pullStartY);
    };
    const onTouchEnd = () => {
      if (pullEligible && pullDistance >= 80) revealHeader();
      pullEligible = false;
    };
    const onTouchCancel = () => {pullEligible = false;};
    let lastWheelAt = 0, wheelEligible = false, wheelPull = 0;
    const onWheel = e => {
      const now = performance.now();
      if (now - lastWheelAt > 250) {
        wheelEligible = editorExpanded && editorScroll.scrollTop <= 2;
        wheelPull = 0;
      }
      lastWheelAt = now;
      if (!wheelEligible || editorScroll.scrollTop > 2) {wheelEligible = false; return;}
      wheelPull = e.deltaY < 0 ? wheelPull - e.deltaY : 0;
      if (wheelPull >= 120) {revealHeader(); wheelEligible = false;}
    };
    editorScroll.addEventListener('scroll', onScroll, {passive: true});
    editorScroll.addEventListener('touchstart', onTouchStart, {passive: true});
    editorScroll.addEventListener('touchmove', onTouchMove, {passive: true});
    editorScroll.addEventListener('touchend', onTouchEnd, {passive: true});
    editorScroll.addEventListener('touchcancel', onTouchCancel, {passive: true});
    editorScroll.addEventListener('wheel', onWheel, {passive: true});
    disposeEditorScroll = () => {
      editorScroll.removeEventListener('scroll', onScroll);
      editorScroll.removeEventListener('touchstart', onTouchStart);
      editorScroll.removeEventListener('touchmove', onTouchMove);
      editorScroll.removeEventListener('touchend', onTouchEnd);
      editorScroll.removeEventListener('touchcancel', onTouchCancel);
      editorScroll.removeEventListener('wheel', onWheel);
    };
  }

  function render(focus = false) {
    if (!host.visible() || screen === 'home') return;
    document.body.classList.toggle('editor-open', screen === 'edit');
    document.body.classList.toggle('reader-open', screen === 'reader');
    document.body.classList.toggle('focus-mode', screen === 'reader' && focusMode);
    const previousScroll = window.scrollY;
    const previousInnerScroll = screen === 'edit' ? (screenRoot()?.querySelector('.editor-scroll')?.scrollTop || 0) : 0;
    clearInterval(timing);
    let html = '';
    try {
      const current = item();
      if (screen === 'edit' && draftItem) html = editorHTML();
      else if (screen === 'reader' && current) html = readerHTML(current);
      else if (screen === 'import' && importedItem) {modal = {type: 'import'}; html = '';}
    } catch { /* preserve existing state */ }

    if (html) {
      disposeEditorScroll();
      disposeEditorScroll = () => {};
      root().innerHTML = html;
      refreshStatus();
      clearContextHelp();
      for (const el of root().querySelectorAll('.iv-doc-input, [data-iv-field="title"]')) resizeField(el);
      if (screen === 'edit') {
        const shell = screenRoot();
        if (!focus && previousInnerScroll > 0) {
          const sc = shell?.querySelector('.editor-scroll');
          if (sc) sc.scrollTop = previousInnerScroll;
        }
        attachEditorScroll(shell);
      }
      if (focus) {
        window.scrollTo(0, 0);
        (screenRoot()?.querySelector('[data-iv-prompt]') || screenRoot()?.querySelector('h1'))?.focus({preventScroll: true});
      } else window.scrollTo(0, previousScroll);
    }
    renderModal();
    if (screen === 'reader' && phase === 'answering') {
      timing = setInterval(() => {
        const node = screenRoot()?.querySelector('[data-iv-clock]');
        if (node) node.textContent = clock(elapsed());
      }, 250);
    }
    updateBusy();
  }

  function updateBusy() {
    for (const container of [screenRoot(), overlays()?.querySelector('.iv-modal-backdrop')]) {
      if (!container) continue;
      container.toggleAttribute('data-iv-busy', pending);
      if (pending) container.setAttribute('aria-busy', 'true');
      else container.removeAttribute('aria-busy');
      for (const btnEl of container.querySelectorAll('button[data-iv-action]:not([data-iv-while-busy])')) {
        if (pending && !btnEl.disabled) {btnEl.disabled = true; btnEl.dataset.ivTempDisabled = '';}
        else if (!pending && btnEl.hasAttribute('data-iv-temp-disabled')) {btnEl.disabled = false; delete btnEl.dataset.ivTempDisabled;}
      }
    }
  }

  async function busy(fn) {
    if (pending) return;
    pending = true;
    updateBusy();
    try {await fn();} catch {setNotice('saveError'); refreshStatus();}
    finally {
      pending = false;
      updateBusy();
      if (interruptionRequested) {interruptionRequested = false; interrupt();}
    }
  }

  function elapsed() {return (answerDraft?.elapsedMs || 0) + (elapsedStart === null ? 0 : Math.round(performance.now() - elapsedStart));}
  function freezeTime() {if (answerDraft) answerDraft.elapsedMs = elapsed(); elapsedStart = null;}

  function storeSession(row, expected) {
    return commit(data => {
      const idx = data.sessions.findIndex(s => s.id === row.id);
      if (idx < 0 && expected) throw new Error('session-changed');
      if (idx >= 0 && expected && (data.sessions[idx].cursor !== expected.cursor || data.sessions[idx].changedAt !== expected.changedAt)) throw new Error('session-changed');
      if (idx < 0) data.sessions.push(row); else data.sessions[idx] = row;
      return data;
    });
  }

  function cancelSpeaker() {
    questionGeneration++;
    if (speakerRequest) host.player()?.cancelSegment(speakerRequest);
    speakerRequest = null;
  }

  function makeRecorder() {
    const recordings = host.recordings();
    return createInterviewRecorder({store: recordings.store, nativeBridge: recordings.nativeBridge, onInterruption: interrupt});
  }

  async function closeCapture() {
    if (!recorder) return;
    const closing = recorder;
    recorder = null;
    try {
      const result = await closing.finish();
      addSegment(result?.segment);
      if (result?.ready) host.recordings().syncIfEnabled();
      else if (answerDraft?.audioSegments.length) setNotice('audioFail');
    } catch {setNotice('audioFail');}
  }

  function addSegment(segment) {if (segment && answerDraft && answerDraft.audioSegments.length < 60) answerDraft.audioSegments.push(segment);}
  async function pauseResponse() {
    vad.stopListening();
    freezeTime();
    try {addSegment(await recorder?.pause());} catch {setNotice('audioFail'); await closeCapture();}
  }

  function updateVadDom(status) {
    const meter = document.getElementById('ivVadMeterFill');
    const label = document.getElementById('ivVadStatusText');
    if (meter && status) meter.style.width = `${Math.round(Math.max(8, Math.min(100, (status.level || 0) * 100)))}%`;
    if (label && status) {
      if (status.phase === 'speaking') label.textContent = t('listeningVoice');
      else if (status.phase === 'silence-countdown') label.textContent = t('nextInSec', {s: Math.max(1, Math.ceil((status.silenceRemainingMs || 1000) / 1000))});
      else label.textContent = t('waitingVoice', {s: config.silenceSeconds || 3});
    }
  }

  async function enterAnswer(token) {
    if (questionGeneration !== token || screen !== 'reader' || interruptionRequested) return;
    const wasAsking = phase === 'asking';
    try {await recorder?.resume();} catch {setNotice('audioFail'); await closeCapture();}
    if (questionGeneration !== token || screen !== 'reader') return;
    phase = 'answering';
    elapsedStart = performance.now();
    render(!wasAsking);
    screenRoot()?.querySelector('.iv-rehearsal-live .rehearsal-primary-btn')?.focus({preventScroll: true});
    if (config.autoMic) {
      const res = await vad.startListeningTurn({
        silenceSeconds: config.silenceSeconds || 3,
        onStateChange: st => updateVadDom(st),
        onSpeechComplete: () => {
          if (questionGeneration === token && phase === 'answering' && !pending && !interruptionRequested) {
            void busy(() => advance('answered'));
          }
        },
        onError: () => {
          config.autoMic = false;
          if (!recorder) host.releaseRecordingAudio();
          setNotice('audioFail');
          if (screen === 'reader') render(false);
        },
      });
      if (!res?.started && questionGeneration === token && phase === 'answering') {
        config.autoMic = false;
        if (!recorder) host.releaseRecordingAudio();
        setNotice('audioFail');
        render(false);
      }
    }
  }

  function speakSegmentText(text, locale, callbacks = {}) {
    const available = host.player(), settings = host.state().settings;
    if (!available?.speakSegment) return null;
    const voice = String(settings.audioLanguage || settings.language).slice(0, 2) === String(locale).slice(0, 2) ? settings.voice || '' : '';
    return available.speakSegment({
      text, title: t('title'), locale, voice, rate: Number(settings.rate) || 1, ...callbacks,
    });
  }

  async function ask(useVoice) {
    const row = session(), current = row?.questions[row.cursor];
    if (!current) return;
    cancelSpeaker();
    vad.stopListening();
    if (interruptionRequested) return;
    const token = questionGeneration;
    if (!useVoice || !host.player()?.speakSegment) return enterAnswer(token);
    phase = 'asking';
    render(true);
    let settled = false;
    const finish = (failed = false) => {
      if (token !== questionGeneration || settled) return;
      settled = true; speakerRequest = null;
      if (failed) setNotice('voiceError');
      void enterAnswer(token);
    };
    try {
      const request = speakSegmentText(current.prompt, row.language, {
        onEnd: () => finish(), onError: () => finish(true), onPaused: () => finish(true),
      });
      if (request && !settled) speakerRequest = request; else if (!settled) finish(true);
    } catch {finish(true);}
  }

  async function activate(row, fresh) {
    areaDropdownOpen = false;
    modal = null;
    if (!row) return;
    if (row.voice || row.record || config.autoMic) host.unlockAudio(row.record || config.autoMic);
    const previous = row;
    if (row.status === 'partial') row = {...row, status: 'paused', changedAt: Date.now()};
    let captureResult;
    if (row.record) {
      phase = 'preparing';
      captureAbort = new AbortController();
      recorder = makeRecorder();
      captureResult = recorder.start(row, captureAbort.signal).then(() => true, () => false);
    }
    if (config.autoMic) {
      const vadRes = await vad.ensureSession({onStreamLost: () => {config.autoMic = false;}});
      if (!vadRes?.ok) {config.autoMic = false; if (!row.record) host.releaseRecordingAudio(); setNotice('audioFail');}
    }
    if ((fresh || row !== previous) && !await storeSession(row, fresh ? undefined : previous)) {
      captureAbort?.abort(); if (captureResult) await captureResult; await closeCapture(); vad.release(); return;
    }
    sessionId = row.id;
    answerDraft = copy(row.draft);
    if (captureResult) {
      screen = 'reader'; render(true);
      if (!await captureResult) {if (!captureAbort?.signal.aborted) setNotice('audioFail'); recorder = null; host.releaseRecordingAudio();}
      captureAbort = null;
    }
    screen = 'reader';
    phase = 'idle';
    hintOpen = false;
    await ask(row.voice);
  }

  async function checkpoint(markPartial = false) {
    const row = session();
    cancelSpeaker();
    vad.release();
    await pauseResponse();
    await closeCapture();
    phase = markPartial ? 'idle' : 'paused';
    const next = {...row, status: markPartial ? 'partial' : 'paused', draft: copy(answerDraft), changedAt: Date.now()};
    if (!await storeSession(next, row)) {render(); return false;}
    if (markPartial) {repeatSelection.clear(); phase = 'idle';}
    render();
    return true;
  }

  function interrupt() {
    if (!host.visible() || screen !== 'reader' || !['preparing', 'asking', 'answering'].includes(phase)) return;
    vad.release();
    if (phase === 'preparing') captureAbort?.abort();
    if (pending) {interruptionRequested = true; return;}
    void busy(() => checkpoint(false));
  }

  async function advance(outcome, repeat = false) {
    if (phase !== 'answering') return;
    const row = session(), question = row.questions[row.cursor];
    cancelSpeaker();
    await pauseResponse();
    if (row.cursor + 1 === row.questions.length) {vad.release(); await closeCapture();}
    const next = confirmInterviewAnswer(row, question.id, outcome, copy(answerDraft));
    if (next && repeat) next.attempts[next.attempts.length - 1].review = 'repeat';
    if (!next || !await storeSession(next, row)) {phase = 'paused'; vad.release(); await closeCapture(); render(); return;}
    hintOpen = false;
    answerDraft = copy(next.draft);
    if (next.status === 'done') {repeatSelection.clear(); phase = 'idle'; render(true); return;}
    await ask(next.voice);
  }

  function releasePlayer() {
    playerGeneration++;
    if (!player) return;
    player.element.pause(); player.element.removeAttribute('src'); player.element.load(); player.release(); player = null;
  }

  async function listen(el) {
    releasePlayer();
    const generation = playerGeneration;
    const row = el.dataset.history ? library().sessions.find(s => s.id === el.dataset.history) : session();
    const slice = row?.attempts.find(a => a.id === el.dataset.id)?.audioSegments[Number(el.dataset.segment)];
    if (!slice) return;
    const slot = el.closest('.iv-attempt')?.querySelector('.iv-clip');
    if (!slot) return;
    for (const other of screenRoot().querySelectorAll('.iv-clip')) if (other !== slot) other.replaceChildren();
    slot.textContent = t('audioLoading');
    try {
      const data = await host.recordings().interviewPlayback(slice.recordingId);
      if (playerGeneration !== generation || !slot.isConnected) {data.release(); return;}
      const start = slice.startMs / 1000, end = Math.min(slice.endMs, data.record.durationMs) / 1000;
      if (end <= start) {data.release(); throw new Error('clip-unavailable');}
      const audio = document.createElement('audio');
      audio.controls = true; audio.preload = 'metadata'; audio.setAttribute('aria-label', t('recordReview')); audio.setAttribute('playsinline', '');
      audio.addEventListener('loadedmetadata', () => {audio.currentTime = start;});
      audio.addEventListener('seeking', () => {if (audio.currentTime < start || audio.currentTime > end + 0.04) audio.currentTime = start;});
      audio.addEventListener('play', () => {if (audio.currentTime >= end || audio.currentTime < start) audio.currentTime = start;});
      audio.addEventListener('timeupdate', () => {if (audio.currentTime >= end && !audio.paused) audio.pause();});
      audio.addEventListener('error', () => {if (slot.isConnected) slot.textContent = t('audioMissing');});
      audio.src = data.url;
      const help = document.createElement('p'); help.textContent = t('pressPlay');
      slot.replaceChildren(audio, help);
      player = {element: audio, release: data.release};
    } catch {if (generation === playerGeneration && slot.isConnected) slot.textContent = t('audioMissing');}
  }

  async function exit() {
    clearTimeout(saveTimer);
    disposeEditorScroll();
    disposeEditorScroll = () => {};
    editorExpanded = false;
    editorToolsHidden = false;
    editorFooterHidden = false;
    areaDropdownOpen = false;
    cancelSpeaker();
    vad.release();
    releasePlayer();
    clearInterval(timing);
    modal = null;
    renderModal();
    document.body.classList.remove('editor-open', 'reader-open', 'focus-mode');
    if (await host.leave() === false) {setNotice('saveError'); refreshStatus(); return;}
    screen = 'home';
  }

  function back() {
    if (!host.visible()) return false;
    if (pending) return true;
    if (modal) {closeIvModal(); return true;}
    if (focusMode) {focusMode = false; render(); return true;}
    if (screen === 'reader') {
      if (['preparing', 'asking', 'answering'].includes(phase)) {
        void busy(async () => {if (await checkpoint(false)) await exit();});
        return true;
      }
      void exit(); return true;
    }
    if (screen === 'edit') {
      if (draftDirty && isValidDraft(draftItem)) {
        void busy(async () => {if (await saveItem(editorOrigin === 'reader', false)) {if (editorOrigin !== 'reader') await exit();}});
        return true;
      }
      if (editorOrigin === 'reader' && itemId) {setScreen('reader'); return true;}
      void exit(); return true;
    }
    void exit(); return true;
  }

  async function saveItem(goPresent = true, notify = true) {
    clearTimeout(saveTimer);
    if (quietSave) await quietSave;
    ensureDraftTitle();
    const version = activeInterviewVersion(draftItem);
    const cleaned = version.questions.filter(q => q.prompt.trim());
    if (cleaned.length && cleaned.length < version.questions.length) version.questions = cleaned;
    if (originalItem && JSON.stringify(item()) !== JSON.stringify(originalItem)) {setNotice('conflict'); refreshStatus(); return false;}
    if (!isValidDraft(draftItem)) {
      render(); setNotice('invalid'); refreshStatus();
      const target = !draftItem.title.trim() ? '[data-iv-field="title"]' : '[data-iv-field="prompt"]';
      screenRoot()?.querySelector(target)?.focus();
      return false;
    }
    const saved = {...copy(draftItem), title: draftItem.title.trim(), changedAt: Date.now()};
    if (!await commit(data => ({...data, items: [...data.items.filter(r => r.id !== saved.id), saved]}))) return false;
    itemId = saved.id;
    originalItem = copy(saved);
    draftDirty = false;
    if (goPresent) {
      phase = 'idle'; sessionId = undefined;
      setScreen('reader', true);
    } else updateEditorStatsUI();
    if (notify) host.toast(t('saved'));
    return true;
  }

  function changeDraft(el) {
    if (screen !== 'edit' || !draftItem) return;
    const key = el.dataset.ivField, version = activeInterviewVersion(draftItem);
    if (!key) return;
    draftDirty = true;
    if (key === 'version') {draftItem.activeId = el.value; render(); return;}
    if (key === 'title' || key === 'categoryId') draftItem[key] = el.value;
    else if (key === 'target') version.targetSec = Math.min(600, Math.max(0, Number(el.value) || 0));
    else if (['prompt', 'hint', 'notes'].includes(key)) {
      const qid = el.dataset.id || el.closest('.iv-doc-pair')?.dataset.id;
      const q = version.questions.find(row => row.id === qid);
      if (q) {
        if (key === 'prompt' && q.prompt !== el.value) delete q.reference;
        q[key] = el.value;
      }
    } else version[key] = el.value;
    version.changedAt = Date.now();
    resizeField(el);
    updateEditorStatsUI();
    if (key === 'notes' || key === 'hint' || key === 'prompt') syncUsePointsTool();
    scheduleAutosave();
  }

  function usePointsFor(id) {
    const version = activeInterviewVersion(draftItem);
    const targets = pointsTargets(version.questions, id);
    if (!targets.length) return;
    for (const q of targets) {
      const pts = pointsTextFor(q);
      q.notes = !q.notes.trim() ? pts : `${q.notes.trimEnd()}\n${pts}`.slice(0, 800);
    }
    const first = targets[0];
    activeQId = first.id; activeField = 'notes';
    draftDirty = true; version.changedAt = Date.now();
    render(false); scheduleAutosave();
    const notesEl = screenRoot()?.querySelector(`.iv-doc-pair[data-id="${first.id}"] [data-iv-field="notes"]`);
    const answerBox = notesEl?.closest('.iv-doc-answer') || notesEl?.closest('.iv-doc-pair');
    answerBox?.scrollIntoView({behavior: 'smooth', block: 'center'});
    notesEl?.focus({preventScroll: true});
    if (answerBox) {
      answerBox.classList.add('is-points-added');
      setTimeout(() => answerBox.classList.remove('is-points-added'), 1500);
    }
    host.toast(targets.length > 1 ? t('addPointsDoneMany', {n: targets.length}) : t('addPointsDone'));
  }

  function insertStarFor(id) {
    const version = activeInterviewVersion(draftItem);
    const q = version.questions.find(row => row.id === id) || version.questions[0];
    if (!q) return;
    const tmpl = t('starTemplate');
    if (!q.notes.trim()) q.notes = tmpl;
    else if (!q.notes.includes(tmpl.split('\n')[0].trim())) q.notes = `${q.notes.trimEnd()}\n\n${tmpl}`.slice(0, 800);
    activeQId = q.id; activeField = 'notes';
    draftDirty = true; version.changedAt = Date.now();
    render(false); scheduleAutosave();
    screenRoot()?.querySelector(`.iv-doc-pair[data-id="${q.id}"] [data-iv-field="notes"]`)?.focus();
  }

  function insertBulletsFor(id) {
    const version = activeInterviewVersion(draftItem);
    const q = version.questions.find(row => row.id === id) || version.questions[0];
    if (!q) return;
    q.notes = q.notes.trim() ? `${q.notes.trimEnd()}\n• `.slice(0, 800) : '• ';
    activeQId = q.id; activeField = 'notes';
    draftDirty = true; version.changedAt = Date.now();
    render(false); scheduleAutosave();
    screenRoot()?.querySelector(`.iv-doc-pair[data-id="${q.id}"] [data-iv-field="notes"]`)?.focus();
  }

  function recognizeQA() {
    const version = activeInterviewVersion(draftItem);
    const q = version.questions.find(row => row.id === activeQId) || version.questions[0];
    if (!q) return;
    const sourceText = q.prompt.includes('\n') ? q.prompt : `${q.prompt}\n${q.notes}`;
    const pairs = recognizeQuestionsFromText(sourceText);
    if (pairs.length < 2 && !(q.prompt.includes('\n') && pairs[0]?.notes)) {
      host.toast(t('recognizeNone')); return;
    }
    const at = version.questions.indexOf(q);
    const created = pairs.map((p, idx) => idx === 0
      ? {...q, prompt: p.prompt.slice(0, 600), notes: (p.notes || q.notes).slice(0, 800)}
      : makeQuestion({prompt: p.prompt, notes: p.notes}, false));
    if (version.questions.length - 1 + created.length > interviewLimits.questions) {setNotice('limit'); refreshStatus(); return;}
    version.questions.splice(at, 1, ...created);
    activeQId = created[0].id; draftDirty = true; version.changedAt = Date.now();
    render(false); scheduleAutosave();
    host.toast(t('recognizeDone'));
  }

  function addFromLibrary() {
    const version = activeInterviewVersion(draftItem);
    const existing = new Set(version.questions.map(q => fold(q.prompt.trim())));
    const toAdd = [];
    for (const key of selectedBankKeys) {
      const [packKey, idxStr] = key.split(':');
      const bank = interviewQuestions(packKey, version.language);
      const q = bank[Number(idxStr)];
      if (q && !existing.has(fold(q.prompt.trim()))) {
        existing.add(fold(q.prompt.trim()));
        toAdd.push(makeQuestion(q, prefillPoints));
      }
    }
    if (!toAdd.length) {closeIvModal(); return;}
    const onlyEmpty = version.questions.length === 1 && !version.questions[0].prompt.trim() && !version.questions[0].notes.trim();
    if (version.questions.length - (onlyEmpty ? 1 : 0) + toAdd.length > interviewLimits.questions) {setNotice('limit'); refreshStatus(); return;}
    if (onlyEmpty) version.questions = toAdd; else version.questions.push(...toAdd);
    if (!draftItem.title.trim()) {
      const firstPack = [...selectedBankKeys][0]?.split(':')[0];
      draftItem.title = t(firstPack || 'title');
    }
    activeQId = toAdd[0].id;
    selectedBankKeys.clear();
    draftDirty = true; version.changedAt = Date.now();
    modal = null;
    render(false);
    scheduleAutosave();
  }

  function applyAutoBuild() {
    const version = activeInterviewVersion(draftItem);
    const generated = buildAutomaticScript(autoPacks, autoDepth, version.language, autoSeed, prefillPoints);
    const hasExisting = version.questions.some(q => q.prompt.trim());
    if (autoReplace || !hasExisting) {
      version.questions = generated;
    } else {
      const existing = new Set(version.questions.map(q => fold(q.prompt.trim())));
      const fresh = generated.filter(q => !existing.has(fold(q.prompt.trim())));
      if (version.questions.length + fresh.length > interviewLimits.questions) {setNotice('limit'); refreshStatus(); return;}
      version.questions.push(...fresh);
    }
    const chosenAreas = [...autoPacks].filter(k => interviewPacks.includes(k)).map(k => t(k));
    if (!draftItem.title.trim() || interviewPacks.some(k => draftItem.title === t(k))) {
      draftItem.title = (chosenAreas.slice(0, 2).join(' · ') || t('title')).slice(0, 120);
    }
    version.area = chosenAreas.slice(0, 2).join(' · ').slice(0, 120);
    activeQId = version.questions[0]?.id || '';
    draftDirty = true; version.changedAt = Date.now();
    modal = null;
    render(false);
    scheduleAutosave();
  }

  function questionEdit(action, id) {
    const v = activeInterviewVersion(draftItem);
    if (action === 'add-question') {
      if (v.questions.length + 1 > interviewLimits.questions) {setNotice('limit'); refreshStatus(); return;}
      const blank = makeQuestion({prompt: ''});
      v.questions.push(blank);
      activeQId = blank.id; activeField = 'prompt';
      draftDirty = true; v.changedAt = Date.now();
      render(false);
      screenRoot()?.querySelector(`.iv-doc-pair[data-id="${blank.id}"] [data-iv-field="prompt"]`)?.focus();
      return;
    }
    const at = v.questions.findIndex(q => q.id === id);
    if (at < 0) return;
    if (action === 'remove-question') {
      if (v.questions.length <= 1) return;
      v.questions.splice(at, 1);
      activeQId = v.questions[Math.min(at, v.questions.length - 1)]?.id || '';
    } else {
      const next = at + (action === 'question-up' ? -1 : 1);
      if (next < 0 || next >= v.questions.length) return;
      [v.questions[at], v.questions[next]] = [v.questions[next], v.questions[at]];
      activeQId = id;
    }
    draftDirty = true; v.changedAt = Date.now();
    render(false); scheduleAutosave();
  }

  async function quickReview(el) {
    const row = session(), id = el.dataset.id, value = el.dataset.review;
    const target = row?.attempts.find(a => a.id === id);
    if (!target) return;
    const nextReview = target.review === value ? '' : value;
    const attempts = row.attempts.map(a => a.id !== id ? a : {...a, review: nextReview, changedAt: Date.now()});
    if (await storeSession({...row, attempts, changedAt: Date.now()}, row)) {
      if (['repeat', 'improve'].includes(nextReview)) repeatSelection.add(target.questionId);
      else if (!nextReview) repeatSelection.delete(target.questionId);
      render(false);
    }
  }

  async function remove(itemOnly) {
    if (!await commit(data => {
      if (itemOnly) return {...data, items: data.items.filter(row => row.id !== itemId), sessions: data.sessions.filter(row => row.interviewId !== itemId), removedItems: [...data.removedItems, {id: itemId, at: Date.now()}]};
      return {...data, sessions: data.sessions.filter(row => row.id !== sessionId), removedSessions: [...data.removedSessions, {id: sessionId, at: Date.now()}]};
    })) return;
    modal = null;
    if (itemOnly) await exit(); else render();
  }

  function fileImport(raw) {
    if (typeof raw !== 'string' || !/"format"\s*:\s*"seprepare-interview-/.test(raw)) return false;
    if (host.visible() && (pending || ['asking', 'answering', 'preparing'].includes(phase))) {host.toast(t('openAfterExit')); return true;}
    try {importedItem = decodeInterview(raw);} catch {host.toast(t('importError')); return true;}
    if (!importedItem) {host.toast(t('importError')); return true;}
    itemId = undefined;
    modal = {type: 'import'};
    void open('import');
    return true;
  }

  function dispatch(action, el) {
    if (action === 'no-mic') {captureAbort?.abort(); return;}
    if (pending) return;
    switch (action) {
      case 'back': back(); break;
      case 'close-modal': closeIvModal(); break;
      case 'library':
        replacingQId = undefined; areaDropdownOpen = false; modalTab = 'browse'; modal = {type: 'library'}; renderModal(); break;
      case 'auto-modal':
        replacingQId = undefined; areaDropdownOpen = false; modalTab = 'auto'; modal = {type: 'library'}; renderModal(); break;
      case 'modal-tab':
        areaDropdownOpen = false;
        modalTab = el.dataset.tab === 'auto' ? 'auto' : 'browse'; renderModal(); break;
      case 'toggle-area-dropdown':
        areaDropdownOpen = !areaDropdownOpen; renderModal();
        if (areaDropdownOpen) overlays()?.querySelector('.iv-area-dropdown')?.scrollIntoView({block: 'nearest'});
        break;
      case 'pick-pack':
        if (el.dataset.pack && interviewPacks.includes(el.dataset.pack)) {pack = el.dataset.pack; areaDropdownOpen = false; renderModal();} break;
      case 'toggle-auto-pack':
        if (el.dataset.pack && interviewPacks.includes(el.dataset.pack)) {
          if (autoPacks.has(el.dataset.pack) && autoPacks.size > 1) autoPacks.delete(el.dataset.pack);
          else autoPacks.add(el.dataset.pack);
          renderModal();
        } break;
      case 'select-all-auto-packs':
        autoPacks = new Set(interviewPacks); renderModal(); break;
      case 'clear-auto-packs':
        autoPacks = new Set(['general']); renderModal(); break;
      case 'set-auto-depth':
        autoDepth = Number(el.dataset.depth) || 6; renderModal(); break;
      case 'shuffle-auto':
        autoSeed++; renderModal(); break;
      case 'add-selected': addFromLibrary(); break;
      case 'apply-auto': applyAutoBuild(); break;
      case 'replace-q':
        replacingQId = el.dataset.id; areaDropdownOpen = false; modalTab = 'browse'; modal = {type: 'library'}; renderModal(); break;
      case 'pick-replacement': {
        const v = activeInterviewVersion(draftItem), at = v.questions.findIndex(q => q.id === replacingQId);
        if (at >= 0) {
          const picked = interviewQuestions(pack, v.language)[Number(el.dataset.index)];
          if (picked) {
            v.questions[at] = makeQuestion(picked, prefillPoints);
            activeQId = v.questions[at].id; draftDirty = true; v.changedAt = Date.now();
          }
        }
        replacingQId = undefined; areaDropdownOpen = false; modal = null; render(false); scheduleAutosave(); break;
      }
      case 'use-points': usePointsFor(el.dataset.id || activeQId); break;
      case 'insert-star': insertStarFor(el.dataset.id || activeQId); break;
      case 'insert-bullets': insertBulletsFor(el.dataset.id || activeQId); break;
      case 'recognize-qa': recognizeQA(); break;
      case 'toggle-hints-editor': showEditorHints = !showEditorHints; render(false); break;
      case 'toggle-editor-expand': setEditorExpanded(!editorExpanded); break;
      case 'hide-editor-tools': setEditorToolsHidden(true); break;
      case 'show-editor-tools': setEditorToolsHidden(false); break;
      case 'dismiss-editor-footer':
        if (editorExpanded) {editorFooterHidden = true; syncEditorExpandedDom();} break;
      case 'add-question': case 'question-up': case 'question-down': case 'remove-question':
        questionEdit(action, el.dataset.id || activeQId); break;
      case 'copy-version': {
        const old = activeInterviewVersion(draftItem);
        if (draftItem.versions.length + 1 > interviewLimits.versions) {setNotice('limit'); refreshStatus(); break;}
        const v = {...copy(old), id: interviewId('vr'), name: t('copyName', {name: old.name}).slice(0, 72), changedAt: Date.now()};
        draftItem.versions.push(v); draftItem.activeId = v.id; draftDirty = true; render(false); scheduleAutosave();
        break;
      }
      case 'delete-version':
        if (draftItem.versions.length > 1) {
          draftItem.versions = draftItem.versions.filter(v => v.id !== draftItem.activeId);
          draftItem.activeId = draftItem.versions[0].id; draftDirty = true; modal = null; render(false); scheduleAutosave();
        } break;
      case 'save-item': void busy(() => saveItem(true, true)); break;
      case 'present-from-menu': modal = null; void busy(() => saveItem(true, false)); break;
      case 'editor-menu': modal = {type: 'editor-menu'}; renderModal(); break;
      case 'pin-draft': draftItem.pinned = !draftItem.pinned; draftDirty = true; modal = null; render(false); scheduleAutosave(); break;
      case 'edit': editFromReader(); break;
      case 'prepare': modal = {type: 'prepare'}; renderModal(); break;
      case 'set-auto-mic': config.autoMic = el.dataset.value === 'true'; saveRehearsalPrefs(config); renderModal(); break;
      case 'set-silence': config.silenceSeconds = Number(el.dataset.seconds) || 3; saveRehearsalPrefs(config); renderModal(); break;
      case 'cycle-silence': {
        const order = [2, 3, 5];
        config.silenceSeconds = order[(order.indexOf(Number(config.silenceSeconds)) + 1) % order.length];
        saveRehearsalPrefs(config);
        if (config.autoMic && phase === 'answering') void enterAnswer(questionGeneration);
        else render(false);
        break;
      }
      case 'toggle-focus': focusMode = !focusMode; render(false); break;
      case 'toggle-hide-answers': config.hideAnswers = !config.hideAnswers; render(false); break;
      case 'toggle-voice':
        config.voice = !config.voice;
        if (session()) session().voice = config.voice;
        render(false); break;
      case 'toggle-record':
        config.record = !config.record;
        render(false); break;
      case 'toggle-surprise':
        config.surprise = !config.surprise;
        render(false); break;
      case 'toggle-auto-mic':
        config.autoMic = !config.autoMic;
        saveRehearsalPrefs(config);
        if (!config.autoMic) {vad.stopListening(); if (phase === 'answering' && !recorder) host.releaseRecordingAudio(); render(false);}
        else if (phase === 'answering') {host.unlockAudio(true); void enterAnswer(questionGeneration);}
        else render(false);
        break;
      case 'reader-mode-switch':
        config.autoMic = el.dataset.value === 'true';
        saveRehearsalPrefs(config);
        if (!config.autoMic) {vad.stopListening(); if (phase === 'answering' && !recorder) host.releaseRecordingAudio(); render(false);}
        else if (phase === 'answering') {host.unlockAudio(true); void enterAnswer(questionGeneration);}
        else render(false);
        break;
      case 'start-direct':
      case 'quick-start':
        void busy(() => activate(createInterviewSession(item(), {...config, questionIds: undefined}), true)); break;
      case 'start':
        void busy(() => activate(createInterviewSession(item(), config), true)); break;
      case 'start-from': {
        const idx = Number(el.dataset.index) || 0;
        const v = activeInterviewVersion(item());
        const ids = v.questions.slice(idx).map(q => q.id);
        void busy(() => activate(createInterviewSession(item(), {...config, questionIds: ids, surprise: false}), true));
        break;
      }
      case 'open-history-session': {
        const h = library().sessions.find(row => row.id === el.dataset.id);
        if (!h) break;
        sessionId = h.id;
        if (h.status === 'done') {phase = 'idle'; render(true);}
        else void busy(() => activate(h, false));
        break;
      }
      case 'hear-question': {
        const idx = Number(el.dataset.index) || 0;
        const row = session();
        const q = (row && row.interviewId === itemId ? row.questions : activeInterviewVersion(item()).questions)[idx];
        const locale = row?.language || activeInterviewVersion(item()).language;
        if (q) {cancelSpeaker(); try {speakSegmentText(q.prompt, locale);} catch {}}
        break;
      }
      case 'resume': void busy(() => activate(session(), false)); break;
      case 'hear': void busy(async () => {await pauseResponse(); await ask(true);}); break;
      case 'answer-now': cancelSpeaker(); void enterAnswer(questionGeneration); break;
      case 'hint':
        hintOpen = !hintOpen;
        if (answerDraft) answerDraft.hintUsed = true;
        render(false); break;
      case 'done': case 'skip': void busy(() => advance(action === 'done' ? 'answered' : 'skipped')); break;
      case 'pause': case 'finish': void busy(() => checkpoint(action === 'finish')); break;
      case 'quick-review': void busy(() => quickReview(el)); break;
      case 'listen': void listen(el); break;
      case 'flagged': {
        const history = library().sessions.filter(s => s.interviewId === itemId).sort((a, b) => b.createdAt - a.createdAt);
        config.questionIds = flaggedQuestions(activeInterviewVersion(item()), history);
        modal = {type: 'prepare'}; renderModal(); break;
      }
      case 'repeat-selected': {
        const ids = [...repeatSelection];
        config.questionIds = ids.length ? ids : undefined;
        void busy(() => activate(createInterviewSession(item(), config), true)); break;
      }
      case 'export':
        modal = {type: 'confirm', title: t('export'), message: t('shareFile'), confirmLabel: 'export', icon: 'FileDown', action: 'export-confirm'};
        renderModal(); break;
      case 'export-confirm': {
        const row = item(), filename = row.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').trim().slice(0, 80) || 'SePrepare';
        host.exportFile(`${filename}.seprepare`, 'application/json', encodeInterview(row));
        closeIvModal(); break;
      }
      case 'accept-import': void busy(async () => {
        if (!await commit(data => ({...data, items: [...data.items, importedItem]}))) return;
        itemId = importedItem.id; importedItem = null; modal = null;
        setScreen('reader', true); host.toast(t('saved'));
      }); break;
      case 'delete-item':
        modal = {type: 'confirm', title: t('deleteItem'), message: t('deleteItemHelp'), confirmLabel: 'deleteItem', icon: 'Trash2', danger: true, action: 'delete-item-confirm'};
        renderModal(); break;
      case 'delete-item-confirm': void busy(() => remove(true)); break;
    }
  }

  document.addEventListener('click', event => {
    if (event.target.matches?.('.iv-modal-backdrop')) {closeIvModal(); return;}
    if (areaDropdownOpen && !event.target.closest?.('.iv-area-picker, [data-iv-action]')) {areaDropdownOpen = false; renderModal();}
    const home = event.target.closest?.('[data-iv-home]');
    const action = event.target.closest?.('.iv-shell [data-iv-action], .iv-modal-backdrop [data-iv-action]');
    if (home || action) {
      const btn = home || action;
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
      if (home?.dataset.ivHome === 'new') startCreate();
      else if (home?.dataset.ivHome === 'edit') void openEditSaved(home.dataset.id);
      else if (home?.dataset.ivHome === 'practice') void openPracticeSaved(home.dataset.id);
      else if (home) void openSaved(home.dataset.id);
      else dispatch(action.dataset.ivAction, action);
    }
  });

  document.addEventListener('focusin', event => {
    const el = event.target;
    if (!el?.closest?.('.interview-editor')) return;
    const pair = el.closest('.iv-doc-pair');
    if (!pair) return;
    const nextId = pair.dataset.id;
    const nextField = el.dataset.ivField === 'notes' ? 'notes' : el.dataset.ivField === 'prompt' ? 'prompt' : activeField;
    activeQId = nextId;
    activeField = nextField;
    const shell = screenRoot();
    if (!shell) return;
    const qs = activeInterviewVersion(draftItem)?.questions || [];
    const idx = Math.max(0, qs.findIndex(q => q.id === nextId));
    for (const row of shell.querySelectorAll('.iv-doc-pair')) row.classList.toggle('is-focused', row.dataset.id === nextId);
    const scope = shell.querySelector('#ivScopeLabel');
    if (scope) scope.innerHTML = `${icon('FileText')}${tr('question')} ${idx + 1} / ${qs.length}`;
    const expCount = shell.querySelector('#ivExpandedCount');
    if (expCount) expCount.textContent = `${t('question')} ${idx + 1} / ${qs.length}`;
    for (const act of ['question-up', 'question-down', 'insert-bullets', 'use-points', 'insert-star', 'remove-question']) {
      const tb = shell.querySelector(`.toolbar [data-iv-action="${act}"]`);
      if (!tb) continue;
      tb.dataset.id = nextId;
      if (act === 'question-up') tb.disabled = idx <= 0;
      else if (act === 'question-down') tb.disabled = idx >= qs.length - 1;
      else if (act === 'remove-question') tb.disabled = qs.length <= 1;
    }
    syncUsePointsTool(shell);
  });

  document.addEventListener('keydown', event => {
    const el = event.target;
    if (el?.matches?.('.interview-editor [data-iv-field="prompt"]') && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      el.closest('.iv-doc-pair')?.querySelector('[data-iv-field="notes"]')?.focus();
    }
  });

  document.addEventListener('input', event => {
    if (event.target.closest?.('.iv-shell') && event.target.matches('input[data-iv-field]:not([type="checkbox"]), textarea[data-iv-field]')) changeDraft(event.target);
  });

  document.addEventListener('change', event => {
    const el = event.target;
    if (!el.closest?.('.iv-shell, .iv-modal-backdrop')) return;
    const {ivField: field, ivOption, ivRepeat, ivPickKey} = el.dataset;
    if (ivOption) {
      config[ivOption] = el.type === 'checkbox' ? el.checked : el.value;
      if (ivOption === 'mode') config.hideAnswers = config.mode === 'simulation';
      if (modal?.type === 'prepare') renderModal();
    }
    if (field === 'pack') {pack = el.value; renderModal();}
    if (field === 'prefill-points') {prefillPoints = el.checked; if (modalTab === 'auto') renderModal();}
    if (field === 'auto-replace') {autoReplace = el.value === 'replace';}
    if (field === 'all-library') {
      const lang = activeInterviewVersion(draftItem)?.language || defaultLanguage();
      const qs = interviewQuestions(pack, lang);
      qs.forEach((_, idx) => {if (el.checked) selectedBankKeys.add(`${pack}:${idx}`); else selectedBankKeys.delete(`${pack}:${idx}`);});
      renderModal();
    }
    if (ivPickKey) {
      if (el.checked) selectedBankKeys.add(ivPickKey); else selectedBankKeys.delete(ivPickKey);
      const addBtn = overlays()?.querySelector('[data-iv-action="add-selected"]');
      if (addBtn) {
        addBtn.disabled = !selectedBankKeys.size;
        const span = addBtn.querySelector('span');
        if (span) span.textContent = t('insertSelectedBtn', {n: selectedBankKeys.size});
      }
      el.closest('.iv-bank-card')?.classList.toggle('is-selected', el.checked);
    }
    if (field === 'active-version') {
      void busy(async () => {
        await commit(data => ({...data, items: data.items.map(row => row.id === itemId ? {...row, activeId: el.value, changedAt: Date.now()} : row)}));
        render();
      });
    } else if (el.tagName === 'SELECT' && screen === 'edit' && field !== 'pack') changeDraft(el);
    if (ivRepeat) {
      if (el.checked) repeatSelection.add(ivRepeat); else repeatSelection.delete(ivRepeat);
      render(false);
    }
  });

  document.addEventListener('visibilitychange', () => {if (document.hidden && host.visible()) interrupt();});
  window.addEventListener('pagehide', interrupt);
  window.addEventListener('nativeBackground', interrupt);
  window.addEventListener('nativeRecordingInterrupted', event => {if (event.detail?.id === recorder?.id()) interrupt();});

  return {render, renderHome, parkCategoryPicker, placeCategoryPicker, afterCreateMenu, back, fileImport, isActive: () => host.visible() && screen === 'reader' && ['preparing', 'asking', 'answering'].includes(phase)};
}
