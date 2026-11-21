# Editor expandido — iPhone/iPad

Shell `20261121.1`, baseado na main `730f74c`.

O modo expandido recolhe o cabeçalho Editor/Visualizar e os indicadores de salvamento, liberando espaço para escrever. O salvamento continua funcionando. Para mostrar o cabeçalho, volte ao começo do texto e puxe para baixo, como no gesto já existente.

A segunda barra mantém os nomes completos em uma linha, incluindo **Marcar tempo** e **Desformatar**. Quando a tela ou o tamanho do texto exigem mais espaço, a barra permite deslizar horizontalmente, com o indicador existente. As cinco ações continuam disponíveis, com áreas de toque de pelo menos 44 px.

Fontes: `parity/editor.css` e `timing/timing.css`; bundle `app.js` gerado pelos builders existentes. `index.html` e `sw.js` anunciam o mesmo shell. Nenhuma alteração em Android, SePrepareApp, formatos de conteúdo, memória, Drive ou voz.

## Verificações

- `node protection/verify-all.mjs`: 775 verificações, incluindo contrato do host e recompilação idempotente.
- `node tests/verify-expanded-editor-ui.mjs`: 21 perfis WebKit com português, inglês, espanhol e japonês, temas claro/escuro, iPhone estreito, paisagem, iPad nas duas orientações, texto a 130% e área reduzida simulando teclado. Conferidas geometria, rótulos, acesso a Revisar, retorno ao cabeçalho e edição/salvamento após reabrir.
- Comparação com o bundle anterior: o perfil 390×844 ganha mais 101 px de área de texto ao recolher o cabeçalho. Capturas e resultados ficam em `tests/qa-output/expanded-editor/` e `expanded-editor-before/`.

O roteiro aceita `QA_URL` para conferir o domínio publicado, `QA_PROFILES` para selecionar perfis e `QA_PLAYWRIGHT` para reaproveitar um módulo Playwright local compatível com os navegadores instalados. `QA_BASELINE` permite comparar o bundle de uma revisão anterior.

São verificações em navegador WebKit, sem iPhone físico. O teclado é simulado por redução da área visível. A confirmação com o teclado nativo do iPhone permanece dependente de aparelho.
