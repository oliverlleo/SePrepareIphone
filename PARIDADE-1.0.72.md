# Paridade com Android 1.0.67–1.0.72

## Recursos integrados

- Marcar tempo calcula a duração acumulada desde o início até o fim da linha visual do cursor, com o estimador existente e ritmos personalizados. Não abre modal nem pede um tempo manual.
- Indicadores à direita, âncora inline no conteúdo e leitura de marcações antigas de bloco. Linhas diferentes do mesmo parágrafo podem ter metas próprias. Na linha marcada, o botão muda para Remover tempo.
- Apresentação utiliza o cronômetro existente, com pausa/retomada/reset, tolerância de ±15 segundos, gradação de cores e diferença de tempo. Rolagem só escolhe a referência visual; não inventa histórico de chegada.
- Mostrar tempo e Mostrar ritmo ficam na barra, independentes, com estado acessível e preferências persistidas. Leitura passa a Ajustes. Ouvir compacto; nomes dos atalhos aparecem apenas quando couberem.
- Faixa de seis atalhos centralizada, sem sobreposição ou quebra, alvos de toque de 44 px e cronômetro de 46 px. Incluídas as correções da cascata de estilos da 1.0.71 e da centralização da 1.0.72.
- Ajuda ao segurar, mouse ou foco pelo teclado. Soltar depois da ajuda não executa a ação; movimento cancela a espera.
- Ferramentas do editor priorizam tempo, ritmo e anotações, com indicador laranja se houver rolagem.
- Formatar muda para Desformatar e remove estilos do trecho selecionado ou do texto inteiro sem seleção, preservando texto, anotações, ritmos e tempos. Desfazer/refazer mantidos.

O comportamento consolidado é o final da 1.0.72; não reintroduz o formulário manual e o posicionamento à esquerda substituídos nas versões seguintes.

## Dados e compatibilidade

Os atributos speech-time (legado) e speech-time-point (âncora inline) são validados e preservados no Delta, versões, arquivos .seprepare, códigos e backup. Os indicadores não entram no texto narrado ou compartilhado como prosa. Preferências usam os campos existentes read.showTimeMarks e read.showRhythms.

Fixtures fictícias geradas pelas implementações Android, Windows e Apple exercitam arquivos/códigos com todas as versões e tempos antigos/novos em cada destino. Testes cruzados adicionais confirmam a igualdade do hash de backup entre Windows e Apple e restauração idempotente de uma alteração de meta. A política de sincronização, intervalo de backup e autorizações de conta não são modificados.

## Verificação

Executados build e suíte completa de cada plataforma, testes do aplicativo compilado com Quill em DOM isolado, cascata completa de CSS, troca de arquivos/códigos entre plataformas e integridade de backup. Os testes de Drive usam serviços simulados, sem conta Google real.

Layout conferido em Microsoft Edge real via CUA: aplicativo Windows com armazenamento do navegador e dados fictícios em 320, 390, 768, 1024, 1280 e 1440 px; componentes renderizados do bundle Apple e módulo de layout real em 320, 390, 768 e 1024 px. Todos com seis controles numa linha, sem sobreposição, contidos na faixa e centralizados. Nos tamanhos largos, grupo completo centralizado. As capturas são locais e usam somente dados fictícios.

O PWA Apple continua bloqueando o acesso pelo PC. A conferência visual dos componentes Apple é isolada, não equivale a executar o PWA em Safari/iOS. Não houve iPhone/iPad físico, voz de sistema real ou Google Drive real. As validações de armazenamento, migração e backup disponíveis no projeto passaram; isso não é uma garantia de ausência absoluta de erros em todos os dispositivos.

## Adaptação Apple/PWA

Os recursos são integrados por timing/build.mjs, sexto estágio após sharing, localization, protection, rhythms e enhancements. Os módulos e estilos são embutidos no host original, sem substituir armazenamento, instalação, gestos, teclado, visualViewport, voz ou autorização do Drive. O contrato de integridade das cinco funções protegidas e a idempotência do build continuam verificados.

Build PWA 20261028.72 consistente em index.html, parâmetros de assets e sw.js. Mesma origem, escopo e chaves de dados. Não limpa Cache Storage de dados pessoais nem IndexedDB/OPFS. Fontes de teste não são publicadas como assets.

Repetir: npm ci --prefix sharing --ignore-scripts; npm ci --prefix localization --ignore-scripts; npm ci --prefix protection --ignore-scripts; npm ci --prefix qa/time-dom --ignore-scripts; node protection/verify-all.mjs. Esse comando compila os seis módulos, executa as suítes e confirma que recompilar não altera os arquivos de entrega.
