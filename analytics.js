/* SePrepare product metrics v1. All values sent by the app are from this catalog. */
(() => {
  'use strict';
  const preference = 'seprepare.metrics.opt-in.v1';
  const lastActivityKey = 'seprepare.metrics.activity.v1';
  const idleMs = 30 * 60 * 1000;
  const actions = {
    caderno: ['buscar', 'abrir_resultado_busca', 'filtrar_categoria', 'fixar'],
    editor: ['salvar_preparacao', 'recuperar_rascunho', 'revisar', 'aplicar_revisao'],
    versoes: ['criar', 'duplicar', 'comparar', 'trocar', 'restaurar'],
    tempo: ['aplicar_ritmo', 'salvar_marca'],
    demonstracao: ['atribuir_falas', 'filtrar_minhas_falas', 'ensaiar'],
    discurso: ['ensaiar'],
    entrevista: ['criar_roteiro', 'aplicar_pontos', 'treinar', 'repetir_pergunta'],
    apresentacao: ['usar_apresentacao', 'iniciar_teleprompter', 'consultar_nota'],
    audio: ['ler_em_voz_alta', 'gravar', 'reproduzir'],
    agenda: ['agendar', 'programar_lembrete', 'gerar_calendario'],
    exportacao: ['gerar_pdf'],
    compartilhamento: ['compartilhar', 'importar'],
    protecao: ['conectar_drive', 'fazer_backup', 'restaurar_backup', 'resolver_conflito']
  };
  const dimensions = {
    tipo: ['discurso', 'demonstracao', 'entrevista'],
    modo: ['manual', 'automatico', 'ritmo', 'guiado', 'simulacao', 'catalogo', 'local', 'online'],
    formato: ['texto', 'arquivo', 'codigo', 'drive'],
    motivo: ['permissao_negada', 'sem_espaco', 'sem_rede', 'conflito', 'formato_invalido',
      'autorizacao', 'indisponivel', 'sem_resultado', 'outro']
  };
  const labels = {
    'pt-BR': ['Estatísticas de uso', 'Ajude a melhorar o SePrepare. O conteúdo do seu Caderno fica fora das estatísticas.'],
    en: ['Usage statistics', 'Help improve SePrepare. Usage statistics exclude your notebook content.'],
    es: ['Estadísticas de uso', 'Ayuda a mejorar SePrepare. Tu cuaderno queda fuera de las estadísticas.'],
    ja: ['利用統計', 'SePrepare の改善にご協力ください。ノートの内容は統計に含まれません。']
  };
  const native = () => globalThis.OradorNative;
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  };
  let config, available = false, tagLoaded = false, lastActivity = 0, consentRevision = 0;
  const pending = [];
  function allowed() {
    try {
      return typeof native()?.metricsConsent === 'function'
        ? native().metricsConsent() === true : read(preference) === 'on';
    } catch { return false; }
  }
  function startTag() {
    if (tagLoaded || !config?.measurement) return;
    tagLoaded = true;
    const id = config.measurement;
    globalThis.dataLayer ||= [];
    globalThis.gtag ||= function () { globalThis.dataLayer.push(arguments); };
    gtag('consent', 'default', {
      analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    gtag('js', new Date());
    gtag('config', id, {
      send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
      page_location: location.origin + '/', page_referrer: '', ignore_referrer: true,
      cookie_domain: 'none', cookie_prefix: 'sp_usage'
    });
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.append(tag);
  }
  function send(event, fields) {
    if (!config || !allowed()) return;
    try {
      if (typeof native()?.metricsEvent === 'function') {
        native().metricsEvent(event, JSON.stringify(fields));
        return;
      }
      if (!config.measurement) return;
      if (navigator.onLine === false) {
        if (pending.length < 60) pending.push([event, fields]);
        return;
      }
      startTag();
      const channel = globalThis.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
        ? 'pwa' : 'navegador';
      gtag('event', event, {
        ...fields, plataforma: config.platform, canal: channel, versao_app: config.version,
        build_app: config.build, send_to: config.measurement, page_location: location.origin + '/',
        page_referrer: '', ignore_referrer: true
      });
    } catch { /* Statistics must never block a product action. */ }
  }
  function activity() {
    if (!available || document.hidden || !allowed()) return;
    const now = Date.now();
    const storedActivity = Number(read(lastActivityKey)) || 0;
    const previous = Math.max(lastActivity, storedActivity);
    lastActivity = now;
    if (now - previous > idleMs || now < previous) send('sp_caderno_pronto', {});
    if (now - storedActivity > 60000 || now < storedActivity) write(lastActivityKey, String(now));
  }
  function fieldsFor(resource, action, extra = {}) {
    if (!Object.prototype.hasOwnProperty.call(actions, resource) || !actions[resource].includes(action)) return null;
    return {
      recurso: resource, acao: action,
      ...Object.fromEntries(Object.entries(dimensions).flatMap(([key, values]) =>
        values.includes(extra[key]) ? [[key, extra[key]]] : []))
    };
  }
  function used(resource, action, extra) {
    const fields = fieldsFor(resource, action, extra);
    if (!fields) return;
    activity();
    send('sp_recurso_usado', fields);
  }
  function begin(resource, action, extra) {
    const fields = fieldsFor(resource, action, extra);
    if (!fields || !allowed()) return () => {};
    activity();
    send('sp_operacao_iniciada', fields);
    const revision = consentRevision;
    let finished = false;
    return (result, reason) => {
      if (finished || revision !== consentRevision || !['sucesso', 'erro', 'cancelado'].includes(result)) return;
      finished = true;
      const outcome = {...fields, resultado: result};
      if (result === 'erro') outcome.motivo = dimensions.motivo.includes(reason) ? reason : 'outro';
      send('sp_operacao_finalizada', outcome);
    };
  }
  function setAllowed(on) {
    let saved = false;
    try {
      saved = typeof native()?.setMetricsConsent === 'function'
        ? native().setMetricsConsent(on) === true : write(preference, on ? 'on' : 'off');
    } catch { return false; }
    if (!saved) return false;
    consentRevision++;
    if (!on) {
      pending.length = 0;
      lastActivity = 0;
      write(lastActivityKey, '0');
    }
    if (config?.measurement) {
      globalThis['ga-disable-' + config.measurement] = !on;
      if (tagLoaded) gtag('consent', 'update', {analytics_storage: on ? 'granted' : 'denied'});
    }
    if (on) activity();
    return true;
  }
  function mountSettings(root) {
    if (!root || root.querySelector('[data-sp-metrics-choice]')) return;
    const [title, hint] = labels[document.documentElement.lang.split('-')[0]] || labels['pt-BR'];
    const label = document.createElement('label');
    label.className = 'check-label';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = allowed();
    toggle.dataset.spMetricsChoice = '';
    const description = document.createElement('small');
    description.className = 'help';
    description.textContent = hint;
    description.id = 'sp-metrics-hint';
    toggle.setAttribute('aria-describedby', description.id);
    toggle.addEventListener('change', () => { if (!setAllowed(toggle.checked)) toggle.checked = allowed(); });
    label.append(toggle, document.createTextNode(' ' + title));
    root.append(label, description);
  }
  function configure(options) { config = options; }
  function ready() { available = true; activity(); }
  function blocked() { available = false; }
  globalThis.SePrepareMetrics = Object.freeze({configure, ready, blocked, used, begin, mountSettings});
  const script = document.currentScript;
  if (script?.dataset.measurement) configure({
    measurement: script.dataset.measurement, platform: script.dataset.platform,
    version: script.dataset.version, build: script.dataset.build
  });
  globalThis.addEventListener('online', () => {
    for (const [event, fields] of pending.splice(0)) send(event, fields);
  });
  globalThis.addEventListener('storage', e => {
    if (e.key !== preference || native()) return;
    consentRevision++;
    if (!allowed()) pending.length = 0;
    if (config?.measurement) {
      globalThis['ga-disable-' + config.measurement] = !allowed();
      if (tagLoaded) gtag('consent', 'update', {analytics_storage: allowed() ? 'granted' : 'denied'});
    }
    for (const toggle of document.querySelectorAll('[data-sp-metrics-choice]')) toggle.checked = allowed();
  });
  document.addEventListener('visibilitychange', activity);
  document.addEventListener('pointerdown', activity, {passive: true});
  document.addEventListener('keydown', activity);
})();
