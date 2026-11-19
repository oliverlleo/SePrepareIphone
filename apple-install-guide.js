/* Guia publico de instalacao: adaptado ao navegador, sem alterar o PWA instalado. */
(() => {
  'use strict';
  const guide = document.querySelector('.installation-guide');
  if (!guide) return;

  const ua = navigator.userAgent || '';
  const isiPad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const isiPhone = /iPhone|iPod/i.test(ua);
  const isMac = !isiPad && !isiPhone && /Macintosh/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isApplePhoneOrPad = isiPad || isiPhone;
  // Browsers embedded in social apps may include "Safari" in the UA.
  // Only skip the Safari step when there is positive evidence of Safari.
  const embeddedOrOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA\/|Instagram|FBAN|FBAV|FB_IAB|MicroMessenger|Line\/|Twitter|TikTok|Snapchat|Pinterest|LinkedInApp|Brave|YaBrowser/i;
  const safari = isApplePhoneOrPad && /AppleWebKit/i.test(ua) && /Safari/i.test(ua) && !embeddedOrOtherBrowser.test(ua);

  const translations = {
    'pt-BR': {
      page: 'Instalar SePrepare', label: 'GUIA DE INSTALAÇÃO', eyebrow: 'SEPREPARE NO SEU',
      title: 'Seu SePrepare,', accent: 'sempre à mão.', intro: 'Adicione o aplicativo à Tela de Início e abra pelo ícone. É rápido e gratuito.',
      safariStatus: 'Você já está no Safari. Comece compartilhando esta página.',
      otherStatus: 'Você está em outro navegador. Comece abrindo o link no Safari.',
      macStatus: 'Instale pelo Safari ou Chrome e abra o SePrepare como aplicativo.',
      androidStatus: 'Este guia é para dispositivos Apple.', androidLink: 'Ver versão para Android',
      stepsLabel: 'PASSO A PASSO', stepsTitle: 'Simples assim.', safariCount: '3 passos',
      otherCount: '4 passos', macCount: '3 passos',
      openTitle: 'Abra no Safari', openText: 'Copie o endereço abaixo e cole na barra do Safari.',
      copy: 'Copiar endereço', copied: 'Endereço copiado!', copyFail: 'Não foi possível copiar. Use ios.seprepareapp.com.br',
      shareTitle: 'Toque em Compartilhar', shareText: 'No Safari, toque no ícone de compartilhar. Se não aparecer, abra o menu de três pontos e escolha Compartilhar.',
      shareHint: 'Safari · Compartilhar', shareAlt: 'ou ••• → Compartilhar',
      addTitle: 'Adicione à Tela de Início', addText: 'Na lista que abrir, selecione “Adicionar à Tela de Início”.',
      addVisual: 'Adicionar à Tela de Início',
      confirmTitle: 'Confirme a instalação', confirmText: 'Mantenha “Abrir como App” ativado, se aparecer, e toque em Adicionar.',
      confirmVisual: 'Abrir como App', addButton: 'Adicionar',
      launchTitle: 'Abra o SePrepare', launchText: 'Volte à Tela de Início e toque no ícone do SePrepare para usar o editor.',
      launchVisual: 'Tela de Início',
      macOpenTitle: 'Abra no Mac', macOpenText: 'Acesse ios.seprepareapp.com.br pelo Safari ou Chrome.',
      macDockTitle: 'Instale como aplicativo', macDockText: 'No Safari, use Arquivo → Adicionar ao Dock. No Chrome, escolha Instalar aplicativo no menu.',
      macDockVisual: 'Adicionar ao Dock / Instalar',
      macLaunchTitle: 'Abra pelo ícone', macLaunchText: 'Inicie o SePrepare pelo Dock, Spotlight ou pela lista de aplicativos.',
      finish: 'Pronto! O editor é liberado ao abrir o aplicativo instalado.',
      help: 'Não encontrou “Adicionar à Tela de Início”?', helpText: 'No Safari, role as opções de compartilhamento para baixo e procure essa ação.',
      links: 'Informações', terms: 'Termos de Serviço', privacy: 'Privacidade', versions: 'Outras versões',
      deviceIphone: 'iPhone', deviceIpad: 'iPad', deviceMac: 'Mac'
    },
    en: {
      page: 'Install SePrepare', label: 'INSTALLATION GUIDE', eyebrow: 'SEPREPARE ON YOUR',
      title: 'Your SePrepare,', accent: 'always at hand.', intro: 'Add the app to your Home Screen and open it from its icon. Quick and free.',
      safariStatus: "You're already in Safari. Start by sharing this page.",
      otherStatus: "You're using another browser. Start by opening this link in Safari.",
      macStatus: 'Install using Safari or Chrome, then open SePrepare as an app.',
      androidStatus: 'This guide is for Apple devices.', androidLink: 'See Android version',
      stepsLabel: 'STEP BY STEP', stepsTitle: 'That simple.', safariCount: '3 steps',
      otherCount: '4 steps', macCount: '3 steps',
      openTitle: 'Open in Safari', openText: 'Copy this address and paste it into Safari’s address bar.',
      copy: 'Copy address', copied: 'Address copied!', copyFail: 'Could not copy. Use ios.seprepareapp.com.br',
      shareTitle: 'Tap Share', shareText: 'In Safari, tap the Share icon. If you do not see it, open the three-dot menu and choose Share.',
      shareHint: 'Safari · Share', shareAlt: 'or ••• → Share',
      addTitle: 'Add to Home Screen', addText: 'From the menu, select “Add to Home Screen”.',
      addVisual: 'Add to Home Screen',
      confirmTitle: 'Confirm installation', confirmText: 'Keep “Open as Web App” enabled, if shown, and tap Add.',
      confirmVisual: 'Open as Web App', addButton: 'Add',
      launchTitle: 'Open SePrepare', launchText: 'Go to your Home Screen and tap the SePrepare icon to use the editor.',
      launchVisual: 'Home Screen',
      macOpenTitle: 'Open on your Mac', macOpenText: 'Visit ios.seprepareapp.com.br in Safari or Chrome.',
      macDockTitle: 'Install as an app', macDockText: 'In Safari, choose File → Add to Dock. In Chrome, choose Install app from the menu.',
      macDockVisual: 'Add to Dock / Install',
      macLaunchTitle: 'Open from the icon', macLaunchText: 'Launch SePrepare from the Dock, Spotlight, or your applications.',
      finish: 'All set! The editor is available when you launch the installed app.',
      help: 'Can’t find “Add to Home Screen”?', helpText: 'In Safari, scroll down the sharing options to find it.',
      links: 'Information', terms: 'Terms of Service', privacy: 'Privacy', versions: 'Other versions',
      deviceIphone: 'iPhone', deviceIpad: 'iPad', deviceMac: 'Mac'
    },
    es: {
      page: 'Instalar SePrepare', label: 'GUÍA DE INSTALACIÓN', eyebrow: 'SEPREPARE EN TU',
      title: 'Tu SePrepare,', accent: 'siempre a mano.', intro: 'Añade la aplicación a la pantalla de inicio y ábrela desde su icono. Fácil y gratis.',
      safariStatus: 'Ya estás en Safari. Comienza compartiendo esta página.',
      otherStatus: 'Estás en otro navegador. Primero abre este enlace en Safari.',
      macStatus: 'Instala con Safari o Chrome y abre SePrepare como aplicación.',
      androidStatus: 'Esta guía es para dispositivos Apple.', androidLink: 'Ver versión para Android',
      stepsLabel: 'PASO A PASO', stepsTitle: 'Así de fácil.', safariCount: '3 pasos',
      otherCount: '4 pasos', macCount: '3 pasos',
      openTitle: 'Abre en Safari', openText: 'Copia esta dirección y pégala en la barra de Safari.',
      copy: 'Copiar dirección', copied: '¡Dirección copiada!', copyFail: 'No se pudo copiar. Usa ios.seprepareapp.com.br',
      shareTitle: 'Toca Compartir', shareText: 'En Safari, toca el icono de compartir. Si no aparece, abre el menú de tres puntos y elige Compartir.',
      shareHint: 'Safari · Compartir', shareAlt: 'o ••• → Compartir',
      addTitle: 'Añade a inicio', addText: 'En la lista, selecciona “Añadir a pantalla de inicio”.',
      addVisual: 'Añadir a pantalla de inicio',
      confirmTitle: 'Confirma la instalación', confirmText: 'Deja activado “Abrir como app”, si aparece, y toca Añadir.',
      confirmVisual: 'Abrir como app', addButton: 'Añadir',
      launchTitle: 'Abre SePrepare', launchText: 'Regresa a la pantalla de inicio y toca el icono de SePrepare para usar el editor.',
      launchVisual: 'Pantalla de inicio',
      macOpenTitle: 'Abre en Mac', macOpenText: 'Visita ios.seprepareapp.com.br desde Safari o Chrome.',
      macDockTitle: 'Instala como aplicación', macDockText: 'En Safari, selecciona Archivo → Añadir al Dock. En Chrome, elige Instalar aplicación.',
      macDockVisual: 'Añadir al Dock / Instalar',
      macLaunchTitle: 'Abre desde el icono', macLaunchText: 'Inicia SePrepare desde el Dock, Spotlight o tus aplicaciones.',
      finish: '¡Listo! El editor se abre al iniciar la aplicación instalada.',
      help: '¿No encuentras “Añadir a pantalla de inicio”?', helpText: 'En Safari, desplázate por las opciones para encontrarla.',
      links: 'Información', terms: 'Términos del servicio', privacy: 'Privacidad', versions: 'Otras versiones',
      deviceIphone: 'iPhone', deviceIpad: 'iPad', deviceMac: 'Mac'
    },
    ja: {
      page: 'SePrepareをインストール', label: 'インストールガイド', eyebrow: 'SEPREPAREを',
      title: 'SePrepareを、', accent: 'いつでも手元に。', intro: 'ホーム画面に追加してアイコンから開くだけ。無料で簡単に使えます。',
      safariStatus: 'Safariで開いています。「共有」から始めましょう。',
      otherStatus: '別のブラウザーで開いています。まずSafariでリンクを開きましょう。',
      macStatus: 'SafariまたはChromeからインストールし、アプリとして開きましょう。',
      androidStatus: 'これはApple端末向けのガイドです。', androidLink: 'Android版を見る',
      stepsLabel: 'インストール手順', stepsTitle: 'かんたん3ステップ。', safariCount: '3ステップ',
      otherCount: '4ステップ', macCount: '3ステップ',
      openTitle: 'Safariで開く', openText: 'アドレスをコピーし、Safariのアドレスバーに貼り付けます。',
      copy: 'アドレスをコピー', copied: 'コピーしました！', copyFail: 'コピーできませんでした。ios.seprepareapp.com.br を開いてください。',
      shareTitle: '「共有」をタップ', shareText: 'Safariの共有アイコンをタップします。見つからない場合は「•••」メニューから「共有」を選びます。',
      shareHint: 'Safari · 共有', shareAlt: 'または ••• → 共有',
      addTitle: 'ホーム画面に追加', addText: '表示されたメニューから「ホーム画面に追加」を選びます。',
      addVisual: 'ホーム画面に追加',
      confirmTitle: '追加を確認', confirmText: '「Webアプリとして開く」が表示されたらオンのまま「追加」をタップします。',
      confirmVisual: 'Webアプリとして開く', addButton: '追加',
      launchTitle: 'SePrepareを開く', launchText: 'ホーム画面に戻り、SePrepareのアイコンからエディターを開きます。',
      launchVisual: 'ホーム画面',
      macOpenTitle: 'Macで開く', macOpenText: 'SafariまたはChromeでios.seprepareapp.com.brを開きます。',
      macDockTitle: 'アプリとして追加', macDockText: 'Safariでは「ファイル → Dockに追加」、Chromeではメニューから「アプリをインストール」を選びます。',
      macDockVisual: 'Dockに追加 / インストール',
      macLaunchTitle: 'アイコンから起動', macLaunchText: 'Dock、Spotlight、またはアプリ一覧から起動します。',
      finish: '完了！インストールしたアプリからエディターを利用できます。',
      help: '「ホーム画面に追加」が見つからない場合', helpText: 'Safariの共有メニューを下にスクロールして探してください。',
      links: '情報', terms: '利用規約', privacy: 'プライバシー', versions: 'その他のバージョン',
      deviceIphone: 'iPhone', deviceIpad: 'iPad', deviceMac: 'Mac'
    }
  };

  const shareIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m-4.5 4.5L12 3l4.5 4.5M5 12v8h14v-8"/></svg>';
  const plusIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const checkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
  const arrowIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
  const url = 'https://ios.seprepareapp.com.br/';

  function language() {
    let locale = 'pt-BR';
    try { locale = localStorage.getItem('seprepare-ui-language') || locale; } catch {}
    return translations[locale] || translations['pt-BR'];
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }
  function illustration(kind, t) {
    if (kind === 'open' || kind === 'macOpen') {
      return '<div class="install-visual install-visual-url"><span class="install-visual-lock">⌁</span><span>ios.seprepareapp.com.br</span></div>';
    }
    if (kind === 'share') {
      return '<div class="install-visual install-visual-share"><span class="install-visual-chip">' +
        shareIcon + '<b>' + escapeHtml(t.shareHint) + '</b></span><span class="install-visual-tip">' + escapeHtml(t.shareAlt) + '</span></div>';
    }
    if (kind === 'add') {
      return '<div class="install-visual install-visual-choice">' + plusIcon + '<span>' + escapeHtml(t.addVisual) + '</span>' + arrowIcon + '</div>';
    }
    if (kind === 'confirm') {
      return '<div class="install-visual install-visual-confirm"><span>' + escapeHtml(t.confirmVisual) + '</span><span class="install-toggle" aria-hidden="true"></span><strong>' + escapeHtml(t.addButton) + '</strong></div>';
    }
    if (kind === 'launch' || kind === 'macLaunch') {
      return '<div class="install-visual install-visual-launch"><img src="branding/apple-touch-icon.png" alt="" width="38" height="38"><span>SePrepare</span><span class="install-visual-tip">' + escapeHtml(t.launchVisual) + '</span></div>';
    }
    return '<div class="install-visual install-visual-choice">' + plusIcon + '<span>' + escapeHtml(t.macDockVisual) + '</span>' + arrowIcon + '</div>';
  }
  function renderStep(kind, number, t) {
    const title = t[kind + 'Title'];
    const body = t[kind + 'Text'];
    const copy = kind === 'open' ?
      '<button type="button" class="install-copy-link" data-install-copy>' +
      '<span>' + escapeHtml(t.copy) + '</span><span aria-hidden="true">↗</span></button>' : '';
    return '<li class="install-step" data-step="' + escapeHtml(kind) + '">' +
      '<span class="install-step-number" aria-hidden="true">' + String(number).padStart(2, '0') + '</span>' +
      '<div class="install-step-body"><h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(body) + '</p>' + copy +
      illustration(kind, t) + '</div></li>';
  }
  function render() {
    const t = language();
    const device = isMac ? t.deviceMac : isiPad ? t.deviceIpad : t.deviceIphone;
    const steps = isMac
      ? ['macOpen', 'macDock', 'macLaunch']
      : safari ? ['share', 'add', 'confirm'] : ['open', 'share', 'add', 'confirm'];
    const status = isAndroid ? t.androidStatus : isMac ? t.macStatus : safari ? t.safariStatus : t.otherStatus;
    const count = isMac ? t.macCount : safari ? t.safariCount : t.otherCount;
    const statusLink = isAndroid
      ? '<a href="https://seprepareapp.com.br/baixar/">' + escapeHtml(t.androidLink) + ' ↗</a>' : '';
    const stepsHtml = steps.map((kind, index) => renderStep(kind, index + 1, t)).join('');
    document.documentElement.lang = t === translations.en ? 'en' : t === translations.es ? 'es' : t === translations.ja ? 'ja' : 'pt-BR';
    document.title = t.page + ' no ' + device;

    guide.innerHTML =
      '<header class="install-header"><div class="install-shell install-topbar">' +
        '<a class="install-brand" href="https://seprepareapp.com.br/" aria-label="SePrepare">' +
          '<img src="branding/logo-dark.png" alt="SePrepare" width="174" height="58"></a>' +
        '<span class="install-top-label"><span class="install-top-dot"></span>' + escapeHtml(t.label) + '</span>' +
      '</div></header>' +
      '<div class="install-shell install-page">' +
        '<section class="install-intro" aria-labelledby="install-title">' +
          '<div class="install-intro-copy">' +
            '<span class="install-overline">' + escapeHtml(t.eyebrow) + ' ' + escapeHtml(device) + '</span>' +
            '<h1 id="install-title">' + escapeHtml(t.title) + ' <em>' + escapeHtml(t.accent) + '</em></h1>' +
            '<p class="install-lead">' + escapeHtml(t.intro) + '</p>' +
            '<div class="install-context" role="status"><span class="install-context-icon">' + checkIcon + '</span>' +
              '<span>' + escapeHtml(status) + statusLink + '</span></div>' +
          '</div>' +
          '<div class="install-app-preview" aria-hidden="true">' +
            '<img src="branding/apple-touch-icon.png" width="76" height="76" alt="">' +
            '<strong>SePrepare</strong><span>APP</span>' +
          '</div>' +
        '</section>' +
        '<section class="install-steps" id="etapas" aria-labelledby="install-steps-title">' +
          '<div class="install-steps-head">' +
            '<div><span class="install-section-kicker">' + escapeHtml(t.stepsLabel) + '</span>' +
              '<h2 id="install-steps-title">' + escapeHtml(t.stepsTitle) + '</h2></div>' +
            '<span class="install-count">' + escapeHtml(count) + '</span>' +
          '</div>' +
          '<ol class="install-timeline">' + stepsHtml + '</ol>' +
          '<div class="install-finish"><span class="install-finish-icon">' + checkIcon + '</span><p>' + escapeHtml(t.finish) + '</p></div>' +
          (!isMac ? '<details class="install-help"><summary>' + escapeHtml(t.help) + '</summary><p>' + escapeHtml(t.helpText) + '</p></details>' : '') +
        '</section>' +
        '<footer class="install-footer">' +
          '<span>© 2026 SePrepare</span><nav aria-label="' + escapeHtml(t.links) + '">' +
          '<a href="https://seprepareapp.com.br/termos/">' + escapeHtml(t.terms) + '</a>' +
          '<a href="https://seprepareapp.com.br/privacidade/">' + escapeHtml(t.privacy) + '</a>' +
          '<a href="https://seprepareapp.com.br/baixar/">' + escapeHtml(t.versions) + '</a>' +
          '</nav></footer>' +
      '</div>';

    const copyButton = guide.querySelector('[data-install-copy]');
    if (copyButton) copyButton.addEventListener('click', async () => {
      let copied = false;
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('clipboard unavailable');
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        const input = document.createElement('textarea');
        input.value = url;
        input.setAttribute('readonly', '');
        input.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
        document.body.appendChild(input);
        input.select();
        try { copied = document.execCommand('copy'); } catch {}
        input.remove();
      }
      copyButton.querySelector('span').textContent = copied ? t.copied : t.copyFail;
      copyButton.classList.toggle('is-copied', copied);
    });

    const items = guide.querySelectorAll('.install-step');
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08 });
      items.forEach(item => observer.observe(item));
    } else {
      items.forEach(item => item.classList.add('is-visible'));
    }
  }
  render();
  window.addEventListener('seprepare:languagechange', render);
})();
