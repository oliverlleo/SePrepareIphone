# SePrepare 1.0.85 — Teleprompter

O seletor de modos passa a oferecer Apresentação, Memorizar e Teleprompter. O menu do discurso também abre a nova tela. A funcionalidade usa o Delta da versão confirmada, sem reconstruir o editor ou modificar o discurso.

## Leitura e controles

- Rolagem automática com velocidade constante ou ritmos padrão e personalizados do texto. Avanço manual por linha, toque, teclado ou controles que enviem as mesmas teclas.
- Faixa de leitura com posição ajustável; tamanho de letra, fonte, largura, entrelinhas, tema próprio, alto contraste e espelhamento horizontal/vertical.
- Contagem inicial cancelável, pausas programadas e progresso com posição estimada no texto. A estimativa de texto não substitui o tempo real do cronômetro de ensaio.
- Modo foco oculta o cabeçalho; os controles desaparecem discretamente durante a rolagem e reaparecem ao toque. Controles cabem em uma linha em telas estreitas; nomes aparecem onde há espaço. Botões têm identificação acessível e ajuda ao segurar.
- Arrastar, usar a roda de rolagem ou ocultar o aplicativo pausa o avanço. A reprodução é retomada manualmente.
- Texto preserva estilos, listas, quebras, ritmo e marcações de tempo. Contraste de cores é adaptado somente na pintura da tela; os valores originais do Delta permanecem intactos.
- Demonstrações identificam participantes e destacam as próprias falas, com filtro para somente minhas falas quando a identidade está definida.

## Navegação e dados

Cada versão pode ter `teleprompter: {schema: 1, preferences, preferencesAt, bookmark, pauses, updatedAt}`. A posição é uma referência ao texto com contexto curto, nunca uma distância em pixels nem uma cópia integral do discurso. Alterações ambíguas exigem conferir o ponto de leitura; pausas não localizadas continuam disponíveis para revisão.

Preferências, posição e pausas acompanham backup, restauração e importação de backup. A mesclagem usa datas independentes para preferências e posição, une pausas por ID e preserva exclusões. O compartilhamento comum de discurso não inclui esses dados pessoais. Salvar progresso não cria uma versão ou revisão do texto.

Ao entrar com áudio, cronômetro ou ensaio interativo em execução, há confirmação para pausar. O tempo acumulado e a posição anterior de leitura são preservados. A troca de modo mantém como origem o Caderno, Editor ou Apresentação; não cria um ciclo de retorno entre modos. Rascunhos continuam pertencendo ao Editor.

## Desempenho e plataformas

Nenhuma dependência, modelo de IA, API de voz ou acesso ao microfone foi acrescentado. O cronograma é calculado uma vez e a posição usa pesquisas binárias. As medições de layout ficam limitadas à linha atual, com cache invalidado quando fonte ou tamanho disponível mudam. O bookmark é gravado ao pausar/sair; não há gravação de backup por frame.

Módulos e formato lógico compartilhados por Android, Windows/Web/PWA e Apple/PWA. Cada host conserva renderização rica, armazenamento, navegação, autorização do Drive e forma existente de manter a tela acesa. O funcionamento de tela acesa depende do suporte do aparelho/navegador.

Testes automatizados usam Chromium e WebKit, dados fictícios e serviços Google simulados. Não substituem validação em aparelhos físicos nem teste com conta Google pessoal. Atalhos Bluetooth dependem das teclas enviadas pelo controle; não foi criada uma integração proprietária de hardware.

Android: versão 1.0.85, código 86, pacote br.com.orador.app, certificado original. APK e manifesto Android hospedados no site não são alterados por esta entrega.
