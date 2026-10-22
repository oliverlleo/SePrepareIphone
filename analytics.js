/* GA4 — SePrepare iPhone (PWA).
 * Não envia conteúdo dos discursos, notas, dados salvos ou códigos de convite.
 * A URL enviada ao GA4 não inclui parâmetros nem fragmentos da página.
 */
(() => {
  'use strict';

  const MEASUREMENT_ID = 'G-689TGVQP48';
  const pageLocation = window.location.origin + window.location.pathname;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('set', 'allow_google_signals', false);
  gtag('set', 'allow_ad_personalization_signals', false);

  // Uma visualização por abertura da aplicação, sem duplicação automática.
  gtag('config', MEASUREMENT_ID, {
    send_page_view: false,
    page_location: pageLocation,
    page_title: 'SePrepare'
  });
  gtag('event', 'page_view', {
    page_location: pageLocation,
    page_title: 'SePrepare'
  });
})();
