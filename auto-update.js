/* SePrepare: discover updates online, apply only after a safe durable save.
 * Existing installations receive this file through versioned URLs in index.html.
 */
(() => {
  'use strict';
  const installed = navigator.standalone === true
    || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  const build = document.documentElement.getAttribute('data-seprepare-build');
  if (!installed || !build || !('serviceWorker' in navigator)) return;

  let registration = null;
  let pendingBuild = '';
  let lastCheck = 0;
  let checking = false;
  let applying = false;
  let lastInteraction = Date.now();
  let interactionCount = 0;
  let warmedWorker = null;
  const CHECK_INTERVAL = 60000;

  const interacted = () => { lastInteraction = Date.now(); interactionCount++; };
  for (const type of ['pointerdown', 'keydown', 'input', 'touchstart', 'wheel']) {
    document.addEventListener(type, interacted, { passive: true, capture: true });
  }

  function safeToApply() {
    const app = window.orador;
    if (!app || typeof app.flushForUpdate !== 'function' || document.hidden || navigator.onLine === false) return false;
    if (Date.now() - lastInteraction < 3000) return false;
    const runtime = app.getRuntime();
    if (!runtime || ['editor', 'part', 'reader'].includes(runtime.view) || runtime.q || runtime.modal) return false;
    if (document.querySelector('.modal-backdrop')) return false;
    if (runtime.audio && String(runtime.audio.state).includes('playing')) return false;
    if (typeof app.isBusyForUpdate === 'function' && app.isBusyForUpdate()) return false;
    if (window.SePrepareRehearsalRuntime?.isActive?.()) return false;
    const focused = document.activeElement;
    if (focused && focused.matches('input,textarea,select,[contenteditable="true"]')) return false;
    return !app.getState().speeches.some(item =>
      (item.timer && item.timer.running) || (item.versions || []).some(version => version.timer && version.timer.running));
  }

  function controllerBuild() {
    const controller = navigator.serviceWorker.controller;
    if (!controller) return Promise.resolve('');
    return new Promise(resolve => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => { channel.port1.close(); resolve(''); }, 1500);
      channel.port1.onmessage = event => {
        clearTimeout(timeout);
        channel.port1.close();
        resolve(event.data && event.data.type === 'SEPREPARE_BUILD' ? event.data.build : '');
      };
      try { controller.postMessage({ type: 'SEPREPARE_GET_BUILD' }, [channel.port2]); }
      catch { clearTimeout(timeout); channel.port1.close(); resolve(''); }
    });
  }

  function showVersion() {
    const app = window.orador;
    if (!app || app.getRuntime().view !== 'settings') return;
    const list = document.querySelector('.settings-list');
    if (!list) return;
    let label = list.querySelector('[data-pwa-version]');
    if (!label) {
      label = document.createElement('p');
      label.className = 'notice';
      label.setAttribute('data-pwa-version', '');
      list.appendChild(label);
    }
    const text = `Versão ${build} · Atualizações automáticas${pendingBuild ? ' · Nova versão será aplicada quando o aplicativo estiver livre.' : ''}`;
    if (label.textContent !== text) label.textContent = text;
  }

  async function applyWhenSafe() {
    if (!pendingBuild || applying || !safeToApply()) return;
    applying = true;
    const interactions = interactionCount;
    try {
      // The worker acknowledges this build only after its essential offline
      // files have been downloaded and its activation has completed.
      if (await controllerBuild() !== pendingBuild || !safeToApply()) return;
      let saveTimeout;
      const saved = await Promise.race([
        window.orador.flushForUpdate(),
        new Promise(resolve => { saveTimeout = setTimeout(() => resolve(false), 10000); })
      ]).finally(() => clearTimeout(saveTimeout));
      if (saved !== true) return;
      if (interactionCount !== interactions || !safeToApply()) return;
      window.location.reload();
    } catch (error) {
      console.warn('SePrepare: atualização adiada; o caderno continua aberto.', error);
    } finally {
      applying = false;
    }
  }

  function warmOffline() {
    const worker = navigator.serviceWorker.controller;
    if (worker && worker !== warmedWorker) {
      warmedWorker = worker;
      worker.postMessage({ type: 'SEPREPARE_WARM_OFFLINE' });
    }
  }

  async function check() {
    if (checking || document.hidden || navigator.onLine === false || Date.now() - lastCheck < CHECK_INTERVAL) return;
    checking = true;
    lastCheck = Date.now();
    try {
      registration = registration || await navigator.serviceWorker.getRegistration();
      if (!registration) return;
      // Cloudflare redirects /index.html; check the canonical root instead.
      const url = new URL('./', document.baseURI);
      url.searchParams.set('seprepare-check', String(Date.now()));
      const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      const html = new DOMParser().parseFromString(await response.text(), 'text/html');
      const latest = html.documentElement.getAttribute('data-seprepare-build');
      if (latest && /^[\w.-]+$/.test(latest) && latest !== build) pendingBuild = latest;
      else if (latest === build) pendingBuild = '';
      await registration.update();
      showVersion();
      await applyWhenSafe();
    } catch {
      // A disconnected device continues using its complete offline copy.
    } finally {
      checking = false;
    }
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    warmOffline();
    applyWhenSafe();
  });
  navigator.serviceWorker.ready.then(value => {
    registration = value;
    warmOffline();
    check();
  }).catch(() => {});
  window.addEventListener('seprepare:ready', () => { showVersion(); check(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  setInterval(check, 5 * 60000);
  setInterval(() => { if (pendingBuild) applyWhenSafe(); }, 2500);
  new MutationObserver(showVersion).observe(document.getElementById('app'), { childList: true, subtree: true });
})();
