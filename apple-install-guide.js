/* Guia de instalação específico para iPad e Mac.
 * Não altera o editor, armazenamento, autorização Google ou atualizador.
 */
(() => {
  'use strict';
  const guide = document.querySelector('.installation-guide');
  if (!guide) return;

  const agent = navigator.userAgent || '';
  const isIpad = /iPad/i.test(agent) || (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1);
  const isIphone = /iPhone|iPod/i.test(agent);
  const isMac = !isIpad && !isIphone && /Macintosh/i.test(agent);
  if (isIpad) {
    // O Safari do iPad pode se apresentar como Mac; os passos de
    // instalação são os mesmos do iPhone e conservam as traduções.
    const iterator = document.createTreeWalker(guide, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = iterator.nextNode())) {
      node.textContent = node.textContent.replace(/IPHONE/g, 'IPAD').replace(/iPhone/g, 'iPad');
    }
    document.title = document.title.replace(/iPhone/g, 'iPad');
    return;
  }
  if (!isMac) return;

  const languages = {
    'pt-BR': {
      title: 'Instalar SePrepare no Mac', top: 'INSTALAÇÃO PARA MAC',
      kicker: 'SEU APLICATIVO, NO SEU MAC',
      lead: 'Instale o SePrepare como aplicativo para abrir em uma janela própria e manter suas preparações no aparelho.',
      explanation: 'O editor será liberado quando você iniciar o SePrepare pelo aplicativo instalado.',
      heading: 'Três passos. Tudo pronto.',
      intro: 'Use o Safari no macOS Sonoma 14 ou posterior, ou instale pelo Chrome.',
      steps: [
        ['Abra no navegador', 'No seu Mac, abra ios.seprepareapp.com.br pelo Safari ou Chrome.'],
        ['Adicione ao Dock', 'No Safari, escolha Arquivo > Adicionar ao Dock. No Chrome, use Instalar aplicativo no menu do navegador.'],
        ['Abra o SePrepare', 'Inicie pelo Dock, pelo Spotlight ou pela lista de aplicativos instalados.']
      ],
      warning: 'O editor só abre pelo aplicativo instalado. A página normal do navegador apresenta as instruções de instalação.'
    },
    en: {
      title: 'Install SePrepare on Mac', top: 'INSTALLATION FOR MAC',
      kicker: 'YOUR APP, ON YOUR MAC',
      lead: 'Install SePrepare as an app to open it in its own window and keep your preparations on the device.',
      explanation: 'The editor becomes available when SePrepare is launched as an installed app.',
      heading: 'Three steps. All set.',
      intro: 'Use Safari on macOS Sonoma 14 or later, or install with Chrome.',
      steps: [
        ['Open in a browser', 'On your Mac, open ios.seprepareapp.com.br in Safari or Chrome.'],
        ['Add to Dock', 'In Safari, choose File > Add to Dock. In Chrome, select Install app from the browser menu.'],
        ['Open SePrepare', 'Launch it from the Dock, Spotlight, or your installed apps.']
      ],
      warning: 'The editor is available only in the installed app. The regular browser page displays installation instructions.'
    },
    es: {
      title: 'Instalar SePrepare en Mac', top: 'INSTALACIÓN PARA MAC',
      kicker: 'TU APLICACIÓN, EN TU MAC',
      lead: 'Instala SePrepare como aplicación para abrirla en su propia ventana y guardar tus preparaciones en el dispositivo.',
      explanation: 'El editor se habilita cuando abres SePrepare como aplicación instalada.',
      heading: 'Tres pasos. Todo listo.',
      intro: 'Utiliza Safari en macOS Sonoma 14 o posterior, o instala desde Chrome.',
      steps: [
        ['Abre el navegador', 'En tu Mac, visita ios.seprepareapp.com.br desde Safari o Chrome.'],
        ['Añade al Dock', 'En Safari, selecciona Archivo > Añadir al Dock. En Chrome, utiliza Instalar aplicación en el menú.'],
        ['Abre SePrepare', 'Inícialo desde el Dock, Spotlight o las aplicaciones instaladas.']
      ],
      warning: 'El editor solo se abre desde la aplicación instalada. La página del navegador muestra las instrucciones de instalación.'
    },
    ja: {
      title: 'MacにSePrepareをインストール', top: 'MAC向けインストール',
      kicker: 'MACでSEPREPAREを使う',
      lead: 'SePrepareをアプリとしてインストールすると、専用ウィンドウで開いて内容をデバイスに保存できます。',
      explanation: 'インストールしたアプリから起動するとエディターを使用できます。',
      heading: '3つのステップで完了。',
      intro: 'macOS Sonoma 14以降のSafari、またはChromeをご利用ください。',
      steps: [
        ['ブラウザで開く', 'MacのSafariまたはChromeでios.seprepareapp.com.brを開きます。'],
        ['Dockに追加', 'Safariでは「ファイル」>「Dockに追加」を選択します。Chromeではメニューからアプリをインストールします。'],
        ['SePrepareを開く', 'Dock、Spotlight、またはインストール済みアプリから起動します。']
      ],
      warning: 'エディターはインストール済みアプリでのみ開きます。通常のブラウザではインストール手順を表示します。'
    }
  };
  let locale = 'pt-BR';
  try { locale = localStorage.getItem('seprepare-ui-language') || locale; } catch {}
  const labels = languages[locale] || languages['pt-BR'];
  const set = (selector, value) => {
    const element = guide.querySelector(selector);
    if (!element) return;
    // Keep the existing icon/badge and other child elements intact.
    const textNode = Array.from(element.childNodes).find(node => node.nodeType === 3);
    if (textNode) textNode.textContent = value;
    else element.appendChild(document.createTextNode(value));
  };
  document.title = labels.title;
  set('.install-top-label', labels.top);
  set('.install-kicker', labels.kicker);
  set('.install-lead', labels.lead);
  set('.install-explain small', labels.explanation);
  set('.install-steps-head > p', labels.intro);
  const cards = guide.querySelectorAll('.install-card');
  labels.steps.forEach(([heading, detail], i) => {
    if (!cards[i]) return;
    const title = cards[i].querySelector('h3');
    const description = cards[i].querySelector('p');
    if (title) title.textContent = heading;
    if (description) description.textContent = detail;
  });
  const warning = guide.querySelector('.install-warning');
  if (warning) warning.textContent = labels.warning;
})();
