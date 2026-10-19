/* SePrepare iPhone: inicia o editor somente no modo PWA instalado.
 * Sem parâmetros de URL, cookies ou atalhos alternativos para liberar.
 */
(() => {
  'use strict';
  const standalone = (typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;

  if (standalone) {
    document.documentElement.setAttribute('data-seprepare-mode', 'installed');
    const appScript = document.createElement('script');
    appScript.src = 'app.js';
    appScript.async = false;
    document.body.appendChild(appScript);
    return;
  }

  document.documentElement.setAttribute('data-seprepare-mode', 'installation');
  document.title = 'Instalar SePrepare no iPhone';
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <main class="installation-guide">
      <header class="install-header">
        <div class="install-shell install-topbar">
          <a class="install-brand" href="https://seprepareapp.com.br/" aria-label="SePrepare — página inicial">
            <img src="branding/logo-light.png" alt="SePrepare" width="167" height="56">
          </a>
          <span class="install-top-label"><span class="install-top-dot"></span> INSTALAÇÃO PARA IPHONE</span>
        </div>
      </header>
      <section class="install-main">
        <div class="install-shell install-hero">
          <div class="install-copy">
            <span class="install-kicker"><span class="install-kicker-dot"></span> SEU APLICATIVO, NO SEU IPHONE</span>
            <h1>Primeiro instale.<br><em>Depois, se prepare.</em></h1>
            <p class="install-lead">Para proteger a experiência do SePrepare, esta versão funciona somente depois de ser adicionada à Tela de Início e aberta pelo seu ícone.</p>
            <div class="install-explain"><span class="install-explain-icon" aria-hidden="true">✦</span><div><strong>Você está na página de instalação</strong><small>O editor só será liberado quando você abrir o SePrepare como aplicativo instalado.</small></div></div>
            <a class="install-jump" href="#etapas">Ver como instalar <span aria-hidden="true">↓</span></a>
          </div>
          <div class="install-art" aria-hidden="true">
            <div class="install-art-orbit"></div>
            <div class="install-phone">
              <div class="install-phone-top"><span>9:41</span><span>●●●</span></div>
              <div class="install-phone-screen">
                <div class="install-phone-icon"><img src="branding/apple-touch-icon.png" alt="" width="72" height="72"></div>
                <span class="install-phone-name">SePrepare</span>
                <span class="install-phone-line"></span><span class="install-phone-line short"></span>
              </div>
              <div class="install-phone-bottom"></div>
            </div>
            <div class="install-art-note"><span class="install-art-note-star">✓</span><div><strong>Na Tela de Início</strong><small>Abra pelo ícone do app</small></div></div>
          </div>
        </div>
      </section>
      <section class="install-steps" id="etapas" aria-labelledby="install-step-title">
        <div class="install-shell">
          <div class="install-steps-head">
            <span class="install-section-kicker">INSTALAÇÃO SIMPLES</span>
            <h2 id="install-step-title">Três passos.<br><em>Tudo pronto.</em></h2>
            <p>Use o Safari no iPhone para adicionar esta página à Tela de Início.</p>
          </div>
          <div class="install-cards">
            <article class="install-card">
              <div class="install-card-top"><span>PASSO 01</span><span aria-hidden="true">↗</span></div>
              <div class="install-step-illustration"><span class="install-browser-icon" aria-hidden="true">◎</span></div>
              <h3>Abra no Safari</h3>
              <p>Se você está em outro navegador, copie o endereço <strong>ios.seprepareapp.com.br</strong> e abra no Safari.</p>
            </article>
            <article class="install-card">
              <div class="install-card-top"><span>PASSO 02</span><span aria-hidden="true">↗</span></div>
              <div class="install-step-illustration"><span class="install-share-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M16 21V4m-6 6 6-6 6 6M8 16H5v11h22V16h-3"/></svg></span></div>
              <h3>Compartilhe a página</h3>
              <p>Toque no botão <strong>Compartilhar</strong> do Safari e escolha <strong>Adicionar à Tela de Início</strong>.</p>
            </article>
            <article class="install-card">
              <div class="install-card-top"><span>PASSO 03</span><span aria-hidden="true">✓</span></div>
              <div class="install-step-illustration"><span class="install-add-icon" aria-hidden="true">＋</span></div>
              <h3>Adicione e abra</h3>
              <p>Se aparecer a opção <strong>Abrir como App</strong>, mantenha-a ativada. Toque em <strong>Adicionar</strong> e abra o SePrepare pelo ícone na Tela de Início.</p>
            </article>
          </div>
          <p class="install-warning"><span aria-hidden="true">ⓘ</span> Abrir o endereço diretamente em qualquer navegador não libera o editor. Para usar, inicie o aplicativo instalado pela Tela de Início.</p>
        </div>
      </section>
      <section class="install-shell install-links">
        <div><span class="install-section-kicker">MAIS INFORMAÇÕES</span><h2>Transparência em <em>cada passo.</em></h2><p>Ao utilizar o aplicativo, você concorda com os Termos de Serviço e declara estar ciente da Política de Privacidade.</p></div>
        <nav aria-label="Documentos e informações"><a href="https://seprepareapp.com.br/termos/">Termos de Serviço <span aria-hidden="true">↗</span></a><a href="https://seprepareapp.com.br/privacidade/">Política de Privacidade <span aria-hidden="true">↗</span></a></nav>
      </section>
      <footer class="install-footer"><div class="install-shell"><span>© 2026 SePrepare</span><a href="https://seprepareapp.com.br/baixar/">Ver outras versões <span aria-hidden="true">↗</span></a></div></footer>
    </main>`;
})();
