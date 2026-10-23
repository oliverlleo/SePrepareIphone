/* SePrepare - aviso legal da primeira utilizacao e consulta permanente em Ajustes.
   O registro e independente dos dados do caderno e nunca entra nos backups. */
(() => {
  'use strict';
  if (window.__seprepareLegalNoticeLoaded) return;
  window.__seprepareLegalNoticeLoaded = true;

  const KEY = 'seprepare-legal-notice-acknowledged';
  const ID = 'seprepare-legal-overlay';
  const TERMS = 'https://seprepareapp.com.br/termos/';
  const PRIVACY = 'https://seprepareapp.com.br/privacidade/';
  const labels = {
    pt: {
      heading: 'Antes de começar', section: 'Termos e privacidade',
      detail: 'Ao usar o SePrepare, você está de acordo com os Termos de Uso e a Política de Privacidade.',
      terms: 'Termos de Uso', privacy: 'Política de Privacidade',
      note: 'Estes documentos ficam disponíveis nos Ajustes.',
      acknowledge: 'Estou ciente',
      failed: 'Não foi possível salvar sua confirmação. Tente novamente.'
    },
    en: {
      heading: 'Before you start', section: 'Terms and privacy',
      detail: 'By using SePrepare, you agree to the Terms of Use and Privacy Policy.',
      terms: 'Terms of Use', privacy: 'Privacy Policy',
      note: 'These documents remain available in Settings.',
      acknowledge: 'I understand',
      failed: 'Your confirmation could not be saved. Please try again.'
    },
    es: {
      heading: 'Antes de empezar', section: 'Términos y privacidad',
      detail: 'Al usar SePrepare, aceptas los Términos de uso y la Política de privacidad.',
      terms: 'Términos de uso', privacy: 'Política de privacidad',
      note: 'Estos documentos siguen disponibles en Ajustes.',
      acknowledge: 'Entendido',
      failed: 'No se pudo guardar tu confirmación. Inténtalo de nuevo.'
    },
    ja: {
      heading: 'はじめる前に', section: '利用規約とプライバシー',
      detail: 'SePrepareを利用することで、利用規約とプライバシーポリシーに同意したものとみなされます。',
      terms: '利用規約', privacy: 'プライバシーポリシー',
      note: 'これらの文書は設定からいつでも確認できます。',
      acknowledge: '確認しました',
      failed: '確認を保存できませんでした。もう一度お試しください。'
    }
  };
  const icon = {
    shield: '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>',
    file: '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></svg>',
    check: '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg>'
  };
  const language = () => {
    const current = (document.documentElement.lang || 'pt').toLowerCase().split('-')[0];
    return labels[current] ? current : 'pt';
  };
  const currentLabels = () => labels[language()];
  const links = l => '<div class="legal-links">' +
    '<a class="btn small secondary legal-document-link" href="' + TERMS + '" target="_blank" rel="noopener noreferrer">' + icon.file + '<span>' + l.terms + '</span></a>' +
    '<a class="btn small secondary legal-document-link" href="' + PRIVACY + '" target="_blank" rel="noopener noreferrer">' + icon.shield + '<span>' + l.privacy + '</span></a>' +
    '</div>';

  let originalAria = null, originalInert = false, hasGate = false, syncScheduled = false;
  const isInstallGuide = () => document.documentElement.getAttribute('data-seprepare-mode') === 'installation';
  const isAcknowledged = () => {
    try { return window.localStorage.getItem(KEY) === 'true'; } catch (_) { return false; }
  };
  function gateMarkup(l) {
    return '<section class="modal legal-notice" role="dialog" aria-modal="true" aria-labelledby="seprepareLegalTitle">' +
      '<header class="modal-head"><h2 id="seprepareLegalTitle">' + l.heading + '</h2></header>' +
      '<div class="modal-body"><p class="help">' + l.detail + '</p>' +
      links(l) + '<p class="notice">' + l.note + '</p>' +
      '<p class="seprepare-legal-error" role="alert" hidden></p></div>' +
      '<footer class="modal-footer"><button type="button" class="btn" id="seprepareLegalAcknowledge">' +
      icon.check + '<span>' + l.acknowledge + '</span></button></footer></section>';
  }
  function settingsMarkup(l) {
    return '<h3>' + icon.shield + l.section + '</h3><p>' + l.detail + '</p>' + links(l);
  }
  function stopEscape(e) {
    const overlay = document.getElementById(ID);
    if (!overlay) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (e.key === 'Tab') {
      const elements = [...overlay.querySelectorAll('a[href],button:not([disabled])')];
      if (!elements.length) { e.preventDefault(); return; }
      const first = elements[0], last = elements[elements.length - 1];
      if (e.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
      return;
    }
    if (!overlay.contains(document.activeElement)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }
  function enforceFocus(e) {
    const overlay = document.getElementById(ID);
    if (overlay && !overlay.contains(e.target)) {
      overlay.querySelector('#seprepareLegalAcknowledge')?.focus({preventScroll: true});
    }
  }
  function acknowledge() {
    let saved = false;
    try {
      window.localStorage.setItem(KEY, 'true');
      saved = window.localStorage.getItem(KEY) === 'true';
    } catch (_) { /* Nao liberar a interface se a confirmacao nao persistiu. */ }
    if (!saved) {
      const message = document.querySelector('#' + ID + ' .seprepare-legal-error');
      if (message) { message.hidden = false; message.textContent = currentLabels().failed; }
      return;
    }
    document.getElementById(ID)?.remove();
    const app = document.getElementById('app');
    if (app && hasGate) {
      app.inert = originalInert;
      if (originalAria === null) app.removeAttribute('aria-hidden');
      else app.setAttribute('aria-hidden', originalAria);
    }
    document.removeEventListener('keydown', stopEscape, true);
    document.removeEventListener('focusin', enforceFocus, true);
    hasGate = false;
    queueSettingsSync();
  }
  function showFirstUse() {
    if (isInstallGuide() || isAcknowledged() || document.getElementById(ID)) return;
    const app = document.getElementById('app');
    if (!app) return;
    originalAria = app.getAttribute('aria-hidden');
    originalInert = app.inert;
    const overlay = document.createElement('div');
    overlay.id = ID;
    overlay.className = 'modal-backdrop seprepare-legal-backdrop';
    overlay.dataset.locale = language();
    overlay.innerHTML = gateMarkup(currentLabels());
    document.body.appendChild(overlay);
    app.inert = true;
    app.setAttribute('aria-hidden', 'true');
    hasGate = true;
    overlay.querySelector('#seprepareLegalAcknowledge').addEventListener('click', acknowledge);
    document.addEventListener('keydown', stopEscape, true);
    document.addEventListener('focusin', enforceFocus, true);
    overlay.querySelector('#seprepareLegalAcknowledge').focus({preventScroll: true});
  }
  function synchronize() {
    if (isInstallGuide()) return;
    const overlay = document.getElementById(ID);
    const current = language(), l = currentLabels();
    if (overlay && overlay.dataset.locale !== current) {
      const errorVisible = !overlay.querySelector('.seprepare-legal-error')?.hidden;
      overlay.innerHTML = gateMarkup(l);
      overlay.dataset.locale = current;
      overlay.querySelector('#seprepareLegalAcknowledge').addEventListener('click', acknowledge);
      if (errorVisible) {
        const error = overlay.querySelector('.seprepare-legal-error');
        error.hidden = false; error.textContent = l.failed;
      }
      overlay.querySelector('#seprepareLegalAcknowledge').focus({preventScroll: true});
    }
    const settings = document.querySelector('#app .settings-list');
    if (!settings) return;
    let card = settings.querySelector('.legal-settings-card');
    if (!card) {
      card = document.createElement('section');
      card.className = 'setting-card legal-settings-card';
      // Como no APK, fica antes da ultima secao (Lixeira).
      settings.insertBefore(card, settings.lastElementChild);
    }
    if (card.dataset.locale !== current) {
      card.innerHTML = settingsMarkup(l);
      card.dataset.locale = current;
    }
  }
  function queueSettingsSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => { syncScheduled = false; synchronize(); });
  }
  function start() {
    if (isInstallGuide()) return; // Pagina publica de instalacao do iPhone.
    showFirstUse();
    const app = document.getElementById('app');
    if (app) new MutationObserver(queueSettingsSync).observe(app, {childList: true, subtree: true});
    new MutationObserver(queueSettingsSync).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
    queueSettingsSync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
