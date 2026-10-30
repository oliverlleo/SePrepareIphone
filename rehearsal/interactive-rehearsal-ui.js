import {
  SILENCE_OPTIONS,
  canOfferInteractiveRehearsal,
  buildRehearsalPlan
} from './interactive-rehearsal-core.js';
import {
  loadRehearsalPreferences,
  saveRehearsalPreferences,
  createRehearsalAudio
} from './interactive-rehearsal-audio.js';
import { createRehearsalVad } from './interactive-rehearsal-vad.js';
import { createRehearsalController } from './interactive-rehearsal-controller.js';
import { activeContentVersion, captureContentVersion } from '../sharing/core.js';

export function createInteractiveRehearsalUI({
  $,
  $$,
  rt,
  icon,
  esc,
  btn,
  t = s => s,
  tr = (strings, ...vals) => strings.reduce((a, p, i) => a + p + (i < vals.length ? vals[i] : ''), ''),
  getActive,
  getSettings,
  audioPlayer,
  openModal,
  closeModal,
  persist,
  toast,
  openEditor,
  refreshIdentity,
  renderReaderContent,
  ensureTimerRunning,
  pauseTimerIfRunning,
  finishRehearsalRecord,
  setReaderPage,
  mediaDevices,
  AudioContextClass
}) {
  let moreMenuOpen = false;
  let setupDraft = null;
  let trackedSpeechId = '';
  let trackedVersionId = '';
  let trackedContentKey = '';

  const audio = createRehearsalAudio({
    player: audioPlayer,
    getSettings,
    t
  });

  const vad = createRehearsalVad({
    ...(mediaDevices ? { mediaDevices } : {}),
    ...(AudioContextClass ? { AudioContextClass } : {}),
    t
  });

  const controller = createRehearsalController({
    audio,
    vad,
    t,
    timer: {
      ensureRunning: () => ensureTimerRunning?.(),
      pauseIfRunning: () => pauseTimerIfRunning?.()
    },
    onChange: snap => {
      updateEntryButtonState(snap);
      renderBar(snap);
      syncReaderDom({ scrollToTurn: false });
    },
    onTurnChange: snap => {
      const s = getActive?.();
      if (s && s.layout === 'pages' && snap.currentTurn && Array.isArray(snap.currentTurn.pages)) {
        if (!snap.currentTurn.pages.includes(rt.page)) {
          setReaderPage?.(snap.currentTurn.page);
        }
      }
      renderBar(snap);
      syncReaderDom({ scrollToTurn: true });
    },
    onVadChange: status => {
      updateVadDomOnly(status);
    },
    onNotice: message => {
      if (message) toast?.(message);
    },
    onComplete: () => {
      moreMenuOpen = false;
      renderBar(controller.getSnapshot());
      syncReaderDom({ scrollToTurn: false });
    }
  });

  function updateEntryButtonState(snap = controller.getSnapshot()) {
    const entry = $('[data-action="open-interactive-rehearsal"]');
    if (!entry) return;
    entry.dataset.active = String(snap.isActive);
    entry.setAttribute('aria-pressed', String(snap.isActive));
  }

  function entryButtonHTML(speech) {
    if (!canOfferInteractiveRehearsal(speech)) return '';
    const activeNow = controller.isActive() && controller.getSnapshot().speechId === speech.id;
    const label = activeNow ? t('Ensaio ativo') : t('Ensaio interativo');
    return `<button type="button" class="btn small soft rehearsal-entry-btn" data-action="open-interactive-rehearsal" data-active="${activeNow}" aria-pressed="${activeNow}">${icon('Mic')}<span>${esc(label)}</span></button>`;
  }

  function mountBar() {
    const paper = $('.reader-paper');
    if (!paper || !paper.parentNode) return;
    let bar = $('#rehearsalBar');
    if (!bar) {
      bar = document.createElement('section');
      bar.id = 'rehearsalBar';
      bar.className = 'rehearsal-bar';
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', t('Controles do Ensaio interativo'));
      bar.hidden = true;
      paper.parentNode.insertBefore(bar, paper);
    }
    const s = getActive?.();
    if (controller.isActive()) {
      const snap = controller.getSnapshot();
      if (
        !s ||
        s.id !== snap.speechId ||
        String(s.activeVersionId || 'default') !== String(snap.versionId || 'default') ||
        (trackedContentKey && String(activeContentVersion(s)?.contentKey || '') !== trackedContentKey) ||
        (s.myParticipantId || '') !== (snap.plan?.myParticipantId || '')
      ) {
        controller.stop({ pauseTimer: true });
        return;
      }
      renderBar(snap);
      syncReaderDom({ scrollToTurn: false });
    } else {
      bar.hidden = true;
      bar.innerHTML = '';
    }
  }

  function updateVadDomOnly(status) {
    const micBox = $('#rehearsalMicStatus');
    if (!micBox || !status) return;
    const fill = $('#rehearsalMicFill');
    const textEl = $('#rehearsalMicLabel');
    if (fill) {
      const pct = Math.max(8, Math.min(100, Math.round((status.level || 0) * 100)));
      fill.style.width = `${pct}%`;
    }
    if (textEl) {
      if (!status.hasStartedSpeaking) {
        textEl.textContent = t('Microfone ouvindo · comece sua fala quando estiver pronto');
      } else if (status.phase === 'silence-countdown') {
        const secs = Math.max(1, Math.ceil((status.silenceRemainingMs || 0) / 1000));
        textEl.textContent = tr`Pausa detectada · avançando em ${secs} s (ou continue falando)`;
      } else {
        textEl.textContent = t('Voz detectada · ouvindo sua fala…');
      }
    }
  }

  function renderBar(snap = controller.getSnapshot()) {
    const bar = $('#rehearsalBar');
    if (!bar) return;
    if (!snap.isActive) {
      bar.hidden = true;
      bar.innerHTML = '';
      return;
    }

    bar.hidden = false;
    const turn = snap.currentTurn;
    const turnNum = Math.min(snap.currentTurnIndex + 1, Math.max(1, snap.totalTurns));

    let badgeClass = '';
    let badgeIcon = 'Mic';
    let badgeText = t('Preparando');
    let speakerLabel = turn ? turn.participantName : '';

    if (snap.state === 'narrating') {
      badgeClass = 'is-narrating';
      badgeIcon = 'Volume2';
      badgeText = t('Narrando');
    } else if (snap.state === 'waiting-user') {
      badgeClass = 'is-user';
      badgeIcon = 'UserRound';
      badgeText = t('Sua vez');
    } else if (snap.state === 'listening') {
      badgeClass = 'is-user';
      badgeIcon = 'Mic';
      badgeText = t('Sua vez');
    } else if (snap.state === 'paused') {
      badgeIcon = 'Pause';
      badgeText = snap.blockedPlayback ? t('Áudio aguardando toque') : t('Pausado');
    } else if (snap.state === 'completed') {
      badgeClass = 'is-listening';
      badgeIcon = 'CheckCircle2';
      badgeText = t('Ensaio concluído');
      speakerLabel = t('Todas as falas foram praticadas');
    } else if (snap.state === 'error') {
      badgeIcon = 'AlertCircle';
      badgeText = t('Atenção');
    }

    const isUserTurn = Boolean(turn?.isUser && ['waiting-user', 'listening'].includes(snap.state));
    const canHint = Boolean(turn?.isUser && snap.showHints && (snap.hideMyLines || snap.hintLevel < 3) && snap.hintLevel < 3 && snap.state !== 'completed');

    let primaryButtonHTML = '';
    if (snap.state === 'completed') {
      primaryButtonHTML = snap.completedSaved
        ? `<button type="button" class="rehearsal-primary-btn secondary" data-action="rehearsal-end">${icon('Check')}<span>${esc(t('Concluir e fechar'))}</span></button>`
        : `<button type="button" class="rehearsal-primary-btn" data-action="rehearsal-save-finish">${icon('Check')}<span>${esc(t('Salvar ensaio'))}</span></button>`;
    } else if (snap.blockedPlayback) {
      primaryButtonHTML = `<button type="button" class="rehearsal-primary-btn" data-action="rehearsal-pause-resume">${icon('Play')}<span>${esc(t('Reproduzir fala'))}</span></button>`;
    } else if (snap.state === 'paused' || snap.state === 'error') {
      primaryButtonHTML = `<button type="button" class="rehearsal-primary-btn" data-action="rehearsal-pause-resume">${icon('Play')}<span>${esc(t('Continuar'))}</span></button>`;
    } else if (isUserTurn) {
      primaryButtonHTML = `<button type="button" class="rehearsal-primary-btn" data-action="rehearsal-done-speaking">${icon('Check')}<span>${esc(t('Terminei minha fala'))}</span></button>`;
    } else {
      primaryButtonHTML = `<button type="button" class="rehearsal-primary-btn secondary" data-action="rehearsal-pause-resume">${icon('Pause')}<span>${esc(t('Pausar'))}</span></button>`;
    }

    const micRowHTML = snap.state === 'listening'
      ? `<div class="rehearsal-mic-status" id="rehearsalMicStatus"><span class="rehearsal-mic-meter" aria-hidden="true"><span class="rehearsal-mic-meter-fill" id="rehearsalMicFill"></span></span><span id="rehearsalMicLabel">${esc(t('Microfone ouvindo · comece sua fala quando estiver pronto'))}</span></div>`
      : '';

    const inlineMessage = snap.blockedPlayback?.message || snap.error?.message || '';
    const noticeHTML = inlineMessage
      ? `<div class="rehearsal-notice-inline" role="status">${esc(inlineMessage)}</div>`
      : '';

    const moreMenuHTML = `
      <div class="rehearsal-more-menu" id="rehearsalMoreMenu" role="menu" ${moreMenuOpen ? '' : 'hidden'}>
        ${snap.state !== 'completed' ? `<button type="button" class="rehearsal-menu-item" data-action="rehearsal-pause-resume">${icon(snap.isRunning ? 'Pause' : 'Play')}<span>${esc(snap.isRunning ? t('Pausar ensaio') : t('Continuar ensaio'))}</span></button>` : ''}
        <button type="button" class="rehearsal-menu-item" data-action="rehearsal-repeat">${icon('RotateCcw')}<span>${esc(t('Repetir última fala'))}</span></button>
        <button type="button" class="rehearsal-menu-item" data-action="rehearsal-prev" ${snap.currentTurnIndex === 0 && snap.state !== 'completed' ? 'disabled' : ''}>${icon('ArrowLeft')}<span>${esc(t('Voltar uma fala'))}</span></button>
        ${snap.state !== 'completed' ? `<button type="button" class="rehearsal-menu-item" data-action="rehearsal-skip">${icon('ArrowRight')}<span>${esc(t('Pular para a próxima fala'))}</span></button>` : ''}
        <button type="button" class="rehearsal-menu-item" data-action="rehearsal-toggle-hide-mine">${icon('UserRound')}<span>${esc(snap.hideMyLines ? t('Mostrar minhas falas') : t('Ocultar minhas falas'))}</span></button>
        <button type="button" class="rehearsal-menu-item" data-action="rehearsal-switch-mode">${icon('Mic')}<span>${esc(snap.mode === 'auto' ? t('Mudar para modo Manual') : t('Mudar para modo Automático'))}</span></button>
        <button type="button" class="rehearsal-menu-item" data-action="rehearsal-open-voices-live">${icon('Headphones')}<span>${esc(t('Vozes dos participantes'))}</span></button>
        <button type="button" class="rehearsal-menu-item danger" data-action="rehearsal-end">${icon('Square')}<span>${esc(t('Encerrar ensaio'))}</span></button>
      </div>
    `;

    bar.innerHTML = `
      <div class="rehearsal-bar-head">
        <div class="rehearsal-status-group">
          <span class="rehearsal-badge ${badgeClass}">${icon(badgeIcon)}<span>${esc(badgeText)}</span></span>
          <span class="rehearsal-speaker-name">${esc(speakerLabel)}</span>
        </div>
        <span class="rehearsal-turn-counter">${esc(snap.state === 'completed' ? `${snap.totalTurns}/${snap.totalTurns}` : tr`Fala ${turnNum}/${snap.totalTurns}`)}</span>
      </div>
      ${micRowHTML}
      ${noticeHTML}
      <div class="rehearsal-actions-row">
        <button type="button" class="rehearsal-icon-action" data-action="rehearsal-prev" aria-label="${esc(t('Voltar uma fala'))}" title="${esc(t('Voltar uma fala'))}" ${snap.currentTurnIndex === 0 && snap.state !== 'completed' ? 'disabled' : ''}>${icon('ArrowLeft')}</button>
        ${primaryButtonHTML}
        ${canHint ? `<button type="button" class="rehearsal-icon-action" data-action="rehearsal-hint" aria-label="${esc(t('Mostrar dica'))}" title="${esc(t('Mostrar dica'))}">${icon('Lightbulb')}</button>` : ''}
        <button type="button" class="rehearsal-icon-action rehearsal-desktop-only" data-action="rehearsal-repeat" aria-label="${esc(t('Repetir última fala'))}" title="${esc(t('Repetir última fala'))}">${icon('RotateCcw')}</button>
        ${snap.state !== 'completed' ? `<button type="button" class="rehearsal-icon-action rehearsal-desktop-only" data-action="rehearsal-skip" aria-label="${esc(t('Pular para a próxima fala'))}" title="${esc(t('Pular para a próxima fala'))}">${icon('ArrowRight')}</button>` : ''}
        <span class="rehearsal-actions-spacer rehearsal-desktop-only"></span>
        <button type="button" class="rehearsal-icon-action" data-action="rehearsal-toggle-more" aria-expanded="${moreMenuOpen}" aria-label="${esc(t('Mais controles do ensaio'))}" title="${esc(t('Mais controles'))}">${icon('MoreHorizontal')}</button>
        ${moreMenuHTML}
      </div>
    `;

    if (snap.state === 'listening' && snap.vadStatus) {
      updateVadDomOnly(snap.vadStatus);
    }
  }

  function clearReaderDecorations() {
    for (const node of $$('#readerText .reading-turn')) {
      node.classList.remove('is-rehearsal-current', 'is-rehearsal-other', 'is-rehearsal-mine');
      node.querySelector('.rehearsal-turn-tag')?.remove();
      node.querySelector('.reading-turn-body')?.classList.remove('is-memorization-hidden');
      node.querySelector('.rehearsal-memorization-box')?.remove();
    }
  }

  function syncReaderDom({ scrollToTurn = false } = {}) {
    const readerText = $('#readerText');
    if (!readerText) return;
    const snap = controller.getSnapshot();
    if (!snap.isActive || !snap.plan) {
      clearReaderDecorations();
      return;
    }

    const currentTurn = snap.currentTurn;
    const activeAudioStarts = new Set(currentTurn?.audioStarts || []);
    const myPid = snap.plan.myParticipantId;
    let firstActiveNode = null;

    for (const node of $$('#readerText .reading-turn')) {
      const audioStart = Number(node.dataset.audioStart);
      const pid = node.dataset.participant || '';
      const isCurrent = snap.state !== 'completed' && activeAudioStarts.has(audioStart);
      const isMine = Boolean(myPid && pid === myPid);

      node.classList.toggle('is-rehearsal-current', isCurrent);
      node.classList.toggle('is-rehearsal-other', isCurrent && !isMine);
      node.classList.toggle('is-rehearsal-mine', isCurrent && isMine);

      const header = node.querySelector('.speaker-label');
      let tag = header?.querySelector('.rehearsal-turn-tag');
      if (isCurrent && header) {
        if (!tag) {
          tag = document.createElement('span');
          tag.className = 'rehearsal-turn-tag';
          header.append(tag);
        }
        tag.textContent = isMine
          ? t('Sua vez')
          : snap.state === 'narrating'
            ? t('Narrando')
            : t('Turno atual');
        if (!firstActiveNode) firstActiveNode = node;
      } else if (tag) {
        tag.remove();
      }

      const body = node.querySelector('.reading-turn-body');
      let memBox = node.querySelector('.rehearsal-memorization-box');

      const shouldMask = Boolean(
        isMine &&
        snap.hideMyLines &&
        snap.state !== 'completed' &&
        !(isCurrent && snap.currentHint?.complete)
      );

      if (shouldMask && body) {
        body.classList.add('is-memorization-hidden');
        if (!memBox) {
          memBox = document.createElement('div');
          memBox.className = 'rehearsal-memorization-box';
          node.append(memBox);
        }
        if (isCurrent) {
          if (snap.hintLevel > 0 && snap.currentHint?.text) {
            const nextBtnLabel = snap.hintLevel === 1
              ? t('Mostrar trecho maior')
              : t('Revelar texto completo');
            memBox.innerHTML = `
              <span class="rehearsal-hint-label">${esc(tr`Dica ${snap.hintLevel} de 3`)}</span>
              <p class="rehearsal-hint-excerpt">${esc(snap.currentHint.text)}</p>
              ${snap.showHints ? `<button type="button" class="btn small soft rehearsal-inline-hint-btn" data-action="rehearsal-hint">${icon('Lightbulb')}<span>${esc(nextBtnLabel)}</span></button>` : ''}
            `;
          } else {
            memBox.innerHTML = `
              <p class="rehearsal-memorization-note">${esc(t('Sua fala está oculta para memorização. Pronuncie sua parte!'))}</p>
              ${snap.showHints ? `<button type="button" class="btn small soft rehearsal-inline-hint-btn" data-action="rehearsal-hint">${icon('Lightbulb')}<span>${esc(t('Mostrar dica'))}</span></button>` : ''}
            `;
          }
        } else {
          memBox.innerHTML = `<p class="rehearsal-memorization-note">${esc(t('Fala oculta para memorização'))}</p>`;
        }
      } else {
        body?.classList.remove('is-memorization-hidden');
        memBox?.remove();
      }
    }

    if (scrollToTurn && firstActiveNode && typeof firstActiveNode.scrollIntoView === 'function') {
      try {
        firstActiveNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        firstActiveNode.scrollIntoView();
      }
    }
  }

  function ensureDraftForSpeech(speech) {
    const prefs = loadRehearsalPreferences();
    if (!setupDraft || setupDraft.speechId !== speech.id) {
      setupDraft = {
        speechId: speech.id,
        speechMyId: speech.myParticipantId || '',
        myParticipantId: speech.myParticipantId || speech.participants?.[0]?.id || '',
        mode: prefs.mode,
        silenceSeconds: prefs.silenceSeconds,
        hideMyLines: prefs.hideMyLines,
        showHints: prefs.showHints
      };
    } else if ((speech.myParticipantId || '') !== setupDraft.speechMyId) {
      setupDraft.speechMyId = speech.myParticipantId || '';
      if (speech.myParticipantId) setupDraft.myParticipantId = speech.myParticipantId;
    }
    return setupDraft;
  }

  function openSetupModal() {
    const s = getActive?.();
    if (!s || !canOfferInteractiveRehearsal(s)) return;
    if (controller.isActive() && controller.getSnapshot().speechId === s.id) {
      // Allow opening voices or reconfiguring cleanly; pause while modal is open
      if (controller.getSnapshot().isRunning) controller.pause();
    }

    const draft = ensureDraftForSpeech(s);
    const plan = buildRehearsalPlan(s, {
      myParticipantId: draft.myParticipantId,
      bypassCache: true
    });

    const participantsOptions = s.participants
      .map(
        p =>
          `<option value="${esc(p.id)}" ${p.id === draft.myParticipantId ? 'selected' : ''}>${esc(p.name)}</option>`
      )
      .join('');

    const warningBlocks = [];
    if (s.participants.length < 2) {
      warningBlocks.push(`
        <div class="rehearsal-warning-card" role="status">
          <p>${esc(t('Esta demonstração tem apenas um participante cadastrado. Adicione pelo menos dois participantes no editor para praticar o diálogo.'))}</p>
          ${btn('rehearsal-fix-unassigned', t('Abrir editor da demonstração'), 'PenLine', 'small secondary')}
        </div>
      `);
    } else if (plan.hasUnassigned) {
      warningBlocks.push(`
        <div class="rehearsal-warning-card" role="status">
          <p>${esc(tr`Há ${plan.unassignedSegments.length} trecho(s) sem participante definido nesta versão. Você pode corrigir a identificação no editor antes de iniciar.`)}</p>
          ${btn('rehearsal-fix-unassigned', t('Corrigir identificação no editor'), 'PenLine', 'small secondary')}
        </div>
      `);
    } else if (plan.turns.length === 0) {
      warningBlocks.push(`
        <div class="rehearsal-warning-card" role="status">
          <p>${esc(t('Escreva e identifique as falas dos participantes no editor antes de iniciar o ensaio.'))}</p>
          ${btn('rehearsal-fix-unassigned', t('Identificar falas no editor'), 'PenLine', 'small secondary')}
        </div>
      `);
    }

    const silenceLabels = {
      2: t('rápido'),
      3: t('padrão'),
      5: t('tolerante')
    };

    const autoSectionHTML = draft.mode === 'auto'
      ? `
        <div class="field" id="rehearsalAutoOptions">
          <label>${esc(t('Pausa na fala para avançar'))}</label>
          <div class="rehearsal-silence-group" role="group" aria-label="${esc(t('Pausa na fala'))}">
            ${SILENCE_OPTIONS.map(
              sec => `
                <button type="button" class="rehearsal-silence-pill" data-action="rehearsal-select-silence" data-seconds="${sec}" aria-pressed="${draft.silenceSeconds === sec}">
                  ${sec} s
                  <small>${esc(silenceLabels[sec])}</small>
                </button>
              `
            ).join('')}
          </div>
          <div class="rehearsal-privacy-note" style="margin-top:8px">
            ${icon('ShieldCheck')}
            <span>${esc(t('A detecção local de fala usa o microfone apenas na sua vez. Ruídos de fundo não precisam desaparecer para avançar. Nenhum áudio é gravado ou enviado.'))}</span>
          </div>
        </div>
      `
      : '';

    const bodyHTML = `
      <p class="help">${esc(t('Pratique sua demonstração com o SePrepare interpretando os outros participantes.'))}</p>
      <div class="stack">
        ${warningBlocks.join('')}
        <div class="field">
          <label for="rehearsalIdentitySelect">${esc(t('Quem sou eu'))}</label>
          <select id="rehearsalIdentitySelect">
            <option value="" ${!draft.myParticipantId ? 'selected' : ''}>${esc(t('Selecione seu participante…'))}</option>
            ${participantsOptions}
          </select>
        </div>
        <div class="field">
          <label>${esc(t('Modo do ensaio'))}</label>
          <div class="rehearsal-mode-cards" role="radiogroup" aria-label="${esc(t('Modo do ensaio'))}">
            <label class="rehearsal-mode-card ${draft.mode === 'manual' ? 'is-selected' : ''}" data-action="rehearsal-select-mode" data-mode="manual">
              <input type="radio" name="rehearsalMode" value="manual" ${draft.mode === 'manual' ? 'checked' : ''}>
              <span>
                <strong>${esc(t('Manual'))}</strong>
                <small>${esc(t('Você indica quando terminou de falar. Não usa o microfone.'))}</small>
              </span>
            </label>
            <label class="rehearsal-mode-card ${draft.mode === 'auto' ? 'is-selected' : ''}" data-action="rehearsal-select-mode" data-mode="auto">
              <input type="radio" name="rehearsalMode" value="auto" ${draft.mode === 'auto' ? 'checked' : ''}>
              <span>
                <strong>${esc(t('Automático'))}</strong>
                <small>${esc(t('O aplicativo identifica quando você terminou de falar pelo microfone.'))}</small>
              </span>
            </label>
          </div>
        </div>
        ${autoSectionHTML}
        <label class="check-label">
          <input type="checkbox" id="rehearsalHideMine" ${draft.hideMyLines ? 'checked' : ''}>
          ${esc(t('Ocultar minhas falas'))}
        </label>
        <label class="check-label">
          <input type="checkbox" id="rehearsalShowHints" ${draft.showHints ? 'checked' : ''}>
          ${esc(t('Mostrar dicas durante o ensaio'))}
        </label>
        ${btn('rehearsal-open-voices', t('Configurar as vozes dos participantes'), 'Headphones', 'secondary')}
      </div>
    `;

    const canStart = s.participants.length >= 2 && plan.turns.length > 0 && Boolean(draft.myParticipantId);
    const footerHTML = btn(
      'rehearsal-start',
      t('Iniciar ensaio'),
      'Play',
      '',
      canStart ? '' : 'disabled'
    );

    openModal(t('Ensaio interativo'), bodyHTML, footerHTML);
    rt.modal = 'interactive-rehearsal-setup';

    $('#rehearsalIdentitySelect')?.addEventListener('change', ev => {
      draft.myParticipantId = ev.target.value;
      openSetupModal();
    });
    $('#rehearsalHideMine')?.addEventListener('change', ev => {
      draft.hideMyLines = ev.target.checked;
    });
    $('#rehearsalShowHints')?.addEventListener('change', ev => {
      draft.showHints = ev.target.checked;
    });
  }

  function openVoicesModal({ returnToLive = false } = {}) {
    const s = getActive?.();
    if (!s || !canOfferInteractiveRehearsal(s)) return;
    const draft = ensureDraftForSpeech(s);
    const myId = draft.myParticipantId || s.myParticipantId || '';
    const resolved = audio.resolveParticipantVoices(s.participants, s.id);
    const voicePool = resolved.allVoices || [];

    const rowsHTML = s.participants
      .map(p => {
        const isMe = p.id === myId;
        const saved = audio.getSavedParticipantVoice(s.id, p.id);
        const assigned = resolved.assignments.get(p.id);
        const currentRate = Number(saved?.rate || assigned?.rate || getSettings()?.rate || 1).toFixed(1);
        const selectedVoice = saved?.voice || '';
        const optionsHTML = [
          `<option value="">${esc(t('Automática para o idioma'))}</option>`,
          ...voicePool.map(v => {
            const label = v.label || `${v.name} · ${v.locale}`;
            const isSelected = selectedVoice && (v.name === selectedVoice || `${v.name}\u001f${v.locale}` === selectedVoice);
            return `<option value="${esc(v.name)}" data-locale="${esc(v.locale || '')}" ${isSelected ? 'selected' : ''}>${esc(label)}</option>`;
          })
        ].join('');

        return `
          <div class="rehearsal-voice-card" data-participant-voice-card="${esc(p.id)}">
            <div class="rehearsal-voice-head">
              <strong>${esc(p.name)}${isMe ? ` · ${esc(t('Você'))}` : ''}</strong>
              <button type="button" class="btn small soft" data-action="rehearsal-test-voice" data-id="${esc(p.id)}">${icon('Play')}<span>${esc(t('Testar'))}</span></button>
            </div>
            <div class="field">
              <label for="pVoice_${esc(p.id)}">${esc(t('Voz sintetizada'))}</label>
              <select id="pVoice_${esc(p.id)}" data-participant-voice-select="${esc(p.id)}">${optionsHTML}</select>
            </div>
            <div class="field">
              <div class="range-line">
                <label for="pRate_${esc(p.id)}">${esc(t('Velocidade'))}</label>
                <output id="pRateOut_${esc(p.id)}">${currentRate}×</output>
              </div>
              <input id="pRate_${esc(p.id)}" data-participant-rate-input="${esc(p.id)}" type="range" min="0.5" max="1.8" step="0.1" value="${currentRate}">
            </div>
          </div>
        `;
      })
      .join('');

    const helperNote = voicePool.length <= 1
      ? t('Mesmo quando há apenas uma voz disponível no dispositivo, o ensaio funciona normalmente com ela.')
      : t('As preferências de voz ficam salvas neste aparelho com fallback automático caso uma voz não esteja instalada.');

    const bodyHTML = `
      <p class="help">${esc(helperNote)}</p>
      <div class="rehearsal-voices-list">${rowsHTML}</div>
    `;

    const backAction = returnToLive ? 'rehearsal-close-voices-live' : 'rehearsal-back-setup';
    const backLabel = returnToLive ? t('Concluir ajustes de voz') : t('Voltar para o ensaio');
    openModal(t('Vozes dos participantes'), bodyHTML, btn(backAction, backLabel, 'Check'));
    rt.modal = 'interactive-rehearsal-voices';

    const escSel = v =>
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(v)
        : String(v).replace(/["\\]/g, '\\$&');

    for (const sel of $$('[data-participant-voice-select]')) {
      sel.addEventListener('change', () => {
        const pid = sel.dataset.participantVoiceSelect;
        const opt = sel.selectedOptions?.[0];
        const rateEl = $(`[data-participant-rate-input="${escSel(pid)}"]`);
        audio.setParticipantVoice(s.id, pid, {
          voice: sel.value,
          locale: opt?.dataset?.locale || '',
          rate: Number(rateEl?.value || 1)
        });
      });
    }
    for (const rng of $$('[data-participant-rate-input]')) {
      rng.addEventListener('input', () => {
        const pid = rng.dataset.participantRateInput;
        const out = $(`#pRateOut_${escSel(pid)}`);
        if (out) out.textContent = `${Number(rng.value).toFixed(1)}×`;
        const sel = $(`[data-participant-voice-select="${escSel(pid)}"]`);
        const opt = sel?.selectedOptions?.[0];
        audio.setParticipantVoice(s.id, pid, {
          voice: sel?.value || '',
          locale: opt?.dataset?.locale || '',
          rate: Number(rng.value)
        });
      });
    }
  }

  async function beginFromDraft() {
    const s = getActive?.();
    if (!s) return;
    const draft = ensureDraftForSpeech(s);
    if (!draft.myParticipantId || !s.participants.some(p => p.id === draft.myParticipantId)) {
      toast?.(t('Escolha seu participante em "Quem sou eu" para iniciar.'));
      return;
    }

    if (s.myParticipantId !== draft.myParticipantId) {
      s.myParticipantId = draft.myParticipantId;
      draft.speechMyId = s.myParticipantId;
      captureContentVersion(s);
      persist?.(true);
      refreshIdentity?.();
    }

    trackedSpeechId = s.id;
    trackedVersionId = String(s.activeVersionId || 'default');
    trackedContentKey = String(activeContentVersion(s)?.contentKey || '');
    moreMenuOpen = false;
    closeModal?.();

    // Ensure all participants' turns are rendered in the reader (temporary override if onlyMine was true)
    renderReaderContent?.();
    mountBar();

    await controller.start({
      speech: s,
      mode: draft.mode,
      silenceSeconds: draft.silenceSeconds,
      hideMyLines: draft.hideMyLines,
      showHints: draft.showHints
    });
  }

  function closeMoreMenu() {
    if (!moreMenuOpen) return;
    moreMenuOpen = false;
    const menu = $('#rehearsalMoreMenu');
    if (menu) menu.hidden = true;
    $('[data-action="rehearsal-toggle-more"]')?.setAttribute('aria-expanded', 'false');
  }

  function handle(action, el) {
    switch (action) {
      case 'open-interactive-rehearsal':
        openSetupModal();
        return true;
      case 'rehearsal-select-mode': {
        const s = getActive?.();
        if (!s) return true;
        const draft = ensureDraftForSpeech(s);
        const mode = el?.dataset?.mode === 'auto' ? 'auto' : 'manual';
        if (draft.mode !== mode) {
          draft.mode = mode;
          draft.hideMyLines = Boolean($('#rehearsalHideMine')?.checked ?? draft.hideMyLines);
          draft.showHints = Boolean($('#rehearsalShowHints')?.checked ?? draft.showHints);
          openSetupModal();
        }
        return true;
      }
      case 'rehearsal-select-silence': {
        const s = getActive?.();
        if (!s) return true;
        const draft = ensureDraftForSpeech(s);
        const secs = Number(el?.dataset?.seconds || 3);
        if (SILENCE_OPTIONS.includes(secs)) {
          draft.silenceSeconds = secs;
          for (const pill of $$('.rehearsal-silence-pill')) {
            pill.setAttribute('aria-pressed', String(Number(pill.dataset.seconds) === secs));
          }
        }
        return true;
      }
      case 'rehearsal-open-voices': {
        const s = getActive?.();
        if (s) {
          const draft = ensureDraftForSpeech(s);
          draft.hideMyLines = Boolean($('#rehearsalHideMine')?.checked ?? draft.hideMyLines);
          draft.showHints = Boolean($('#rehearsalShowHints')?.checked ?? draft.showHints);
        }
        openVoicesModal({ returnToLive: false });
        return true;
      }
      case 'rehearsal-open-voices-live':
        closeMoreMenu();
        if (controller.getSnapshot().isRunning) controller.pause();
        openVoicesModal({ returnToLive: true });
        return true;
      case 'rehearsal-back-setup':
        audio.cancel();
        openSetupModal();
        return true;
      case 'rehearsal-close-voices-live':
        audio.cancel();
        closeModal?.();
        return true;
      case 'rehearsal-test-voice': {
        const s = getActive?.();
        const pid = el?.dataset?.id || '';
        if (!s || !pid) return true;
        const plan = buildRehearsalPlan(s, { myParticipantId: s.myParticipantId });
        const sampleTurn = plan.turns.find(turn => turn.participantId === pid);
        const sample = sampleTurn?.spokenText?.slice(0, 160) || t('Bom dia! Gostaria de compartilhar uma ideia breve com você.');
        const resolved = audio.resolveParticipantVoices(s.participants, s.id);
        const chosen = resolved.assignments.get(pid);
        audio.previewVoice({
          voice: chosen?.voice || '',
          locale: chosen?.locale || resolved.locale,
          rate: chosen?.rate || 1,
          sampleText: sample,
          onError: err => toast?.(err?.message || t('Não foi possível reproduzir o teste de voz.'))
        });
        return true;
      }
      case 'rehearsal-fix-unassigned': {
        const s = getActive?.();
        closeModal?.();
        if (s) openEditor?.(s.id);
        return true;
      }
      case 'rehearsal-start': {
        const s = getActive?.();
        if (s) {
          const draft = ensureDraftForSpeech(s);
          draft.hideMyLines = Boolean($('#rehearsalHideMine')?.checked ?? draft.hideMyLines);
          draft.showHints = Boolean($('#rehearsalShowHints')?.checked ?? draft.showHints);
          saveRehearsalPreferences({
            mode: draft.mode,
            silenceSeconds: draft.silenceSeconds,
            hideMyLines: draft.hideMyLines,
            showHints: draft.showHints
          });
        }
        void beginFromDraft();
        return true;
      }
      case 'rehearsal-done-speaking':
        closeMoreMenu();
        controller.finishUserTurn();
        return true;
      case 'rehearsal-pause-resume': {
        closeMoreMenu();
        const snap = controller.getSnapshot();
        if (snap.isRunning) controller.pause();
        else void controller.resume();
        return true;
      }
      case 'rehearsal-prev':
        closeMoreMenu();
        controller.previousTurn();
        return true;
      case 'rehearsal-repeat':
        closeMoreMenu();
        controller.repeatLastTurn();
        return true;
      case 'rehearsal-skip':
        closeMoreMenu();
        controller.skipTurn();
        return true;
      case 'rehearsal-hint':
        closeMoreMenu();
        controller.revealHint();
        return true;
      case 'rehearsal-toggle-more':
        moreMenuOpen = !moreMenuOpen;
        renderBar();
        return true;
      case 'rehearsal-toggle-hide-mine':
        closeMoreMenu();
        controller.setHideMyLines(!controller.getSnapshot().hideMyLines);
        return true;
      case 'rehearsal-switch-mode': {
        closeMoreMenu();
        const nextMode = controller.getSnapshot().mode === 'auto' ? 'manual' : 'auto';
        void controller.switchMode(nextMode);
        return true;
      }
      case 'rehearsal-save-finish': {
        closeMoreMenu();
        const interactionMode = controller.getSnapshot().mode;
        controller.markCompletedSaved();
        controller.stop({ pauseTimer: false });
        finishRehearsalRecord?.({ mode: 'interactive', interactionMode });
        renderReaderContent?.();
        return true;
      }
      case 'rehearsal-end': {
        closeMoreMenu();
        const wasActive = controller.isActive();
        controller.stop({ pauseTimer: true });
        if (wasActive) renderReaderContent?.();
        return true;
      }
      default:
        return false;
    }
  }

  // Close secondary menu on outside click
  if (typeof document !== 'undefined') {
    document.addEventListener('click', ev => {
      if (!moreMenuOpen) return;
      if (ev.target?.closest?.('#rehearsalMoreMenu, [data-action="rehearsal-toggle-more"]')) return;
      closeMoreMenu();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && controller.isActive()) {
        if (controller.getSnapshot().isRunning) controller.pause();
        else vad.release();
      }
    });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      if (controller.isActive()) {
        if (controller.getSnapshot().isRunning) controller.pause();
        else vad.release();
      }
    });
    window.addEventListener('nativeBackground', () => {
      if (controller.isActive()) {
        if (controller.getSnapshot().isRunning) controller.pause();
        else vad.release();
      }
    });
  }

  function onModalClosed(modalName) {
    if (modalName === 'interactive-rehearsal-voices') {
      audio.cancel();
    }
  }

  function checkContextContinuity() {
    if (!controller.isActive()) return;
    const s = getActive?.();
    if (
      rt.view !== 'reader' ||
      !s ||
      s.id !== trackedSpeechId ||
      String(s.activeVersionId || 'default') !== trackedVersionId ||
      (trackedContentKey && String(activeContentVersion(s)?.contentKey || '') !== trackedContentKey) ||
      (s.myParticipantId || '') !== (controller.getSnapshot().plan?.myParticipantId || '')
    ) {
      controller.stop({ pauseTimer: true });
    }
  }

  function consumeFinishMetadata() {
    if (!controller.isActive()) return undefined;
    const interactionMode = controller.getSnapshot().mode;
    controller.stop({ pauseTimer: false });
    setTimeout(() => renderReaderContent?.(), 0);
    return { mode: 'interactive', interactionMode };
  }

  return {
    controller,
    audio,
    vad,
    isActive: () => controller.isActive(),
    shouldShowAllLines: () => controller.isActive(),
    entryButtonHTML,
    mountBar,
    syncReaderDom,
    openSetupModal,
    handle,
    onModalClosed,
    checkContextContinuity,
    syncTimerState: running => controller.syncTimerState(running),
    consumeFinishMetadata,
    dispose: () => {
      moreMenuOpen = false;
      audio.cancel();
      controller.stop({ pauseTimer: false });
    }
  };
}
