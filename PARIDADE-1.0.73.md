# Paridade 1.0.73 — Ensaio interativo no PWA Apple

## Recursos integrados

- **Ensaio interativo** disponível exclusivamente em Demonstrações com múltiplos participantes (`type === 'part'`) na faixa contextual `.reader-identity`, sem adicionar um sétimo botão aos seis controles centralizados de `.reader-subtools`.
- **Modo Manual (padrão)**: narra automaticamente as falas dos demais participantes por síntese local, pausa na vez do usuário (`Sua vez` / `Terminei minha fala`), funciona offline e nunca solicita acesso ao microfone.
- **Modo Automático (detecção local de voz)**: solicita microfone somente ao iniciar o modo Automático, calibra o ruído ambiente, aguarda o início real da fala antes de contar o silêncio (2 s, 3 s ou 5 s) e faz fallback imediato para o modo Manual preservando o turno atual em caso de negação, perda do microfone ou restrição do navegador. Nenhum áudio é gravado, armazenado ou enviado.
- **Memorização e vozes por participante**: `Ocultar minhas falas` com revelação progressiva em 3 níveis (`Mostrar dica`), associação de voz e velocidade por participante com fallback seguro, sincronização com o cronômetro existente e registro no histórico de ensaios da versão ativa (`rehearsalMode: 'interactive'`).
- **Ajustes e Ajuda**: seção `Ensaio interativo` em `Ajustes -> Leitura e voz`, tópico dedicado em `Guia rápido` e versão `1.0.73` visível em `Ajustes`.

## Adaptação Apple/PWA e proteção de dados

- Integrado por `rehearsal/build.mjs` como sétimo estágio após `sharing`, `localization`, `protection`, `rhythms`, `enhancements` e `timing`, preservando as cinco funções protegidas do host Apple (`Pb`, `aI`, `flushForUpdate`, `Tr`, `le`) e a idempotência byte a byte do build.
- Reaproveita `audio-parity.js` mantendo todas as salvaguardas para iPhone/iPad/Safari (controle de sessão, divisão em trechos de 220 caracteres, `startupTimer` de 4500 ms, exclusão mútua com `Ouvir`/`Testar voz`, limpeza em `visibilitychange`/`pagehide` e retomada limpa caso o WebKit exija novo toque).
- Build PWA `20261029.73` consistente em `index.html`, parâmetros de assets e `sw.js`. Compatibilidade integral de códigos de compartilhamento, arquivos `.seprepare` e hash de backup do Google Drive entre Android, Windows/Web e iPhone/iPad/macOS.
