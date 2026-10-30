# SePrepare 1.0.73 e 1.0.74 — Ensaio interativo e detecção de fala

Integra a funcionalidade completa da 1.0.73 (turnos por participante, modo Manual/Automático, memorização, vozes e histórico) e substitui a detecção por volume pela classificação de fala da 1.0.74.

## Navegadores e microfone

- AudioContext é criado e retomado dentro do toque do usuário, com getUserMedia solicitado antes de aguardar o modelo. Não depende de navigator.permissions, que varia no Safari.
- Captura com AudioWorklet; alternativa com ScriptProcessor para navegadores/restrições sem Worklet. Ambos fornecem PCM ao mesmo modelo; não há retorno ao detector de volume.
- Usa a frequência real de áudio do navegador, reamostra para 16 kHz e preserva leituras parciais. Dispositivos estéreo são combinados em mono.
- Desativa ganho automático quando aceito. Constraints de processamento não são obrigatórias; recusa de permissão não gera pedidos repetidos.
- Faixa do microfone fica silenciada durante a narração. Pausa, saída, troca de tela e segundo plano liberam captura, contexto e worker. Interrupções não são contadas como silêncio; perda da captura preserva o turno no modo Manual com orientação.

## Modelo e PWA

Silero VAD 5.1.2 é o mesmo modelo do APK, verificado por SHA-256. Executa em Worker local com ONNX Runtime Web 1.18.0, WASM escalar e uma thread, inclusive sem SIMD/SharedArrayBuffer. Esse runtime isolado não altera o motor semântico existente. Áudio não é transcrito, gravado em arquivo ou enviado para reconhecimento remoto.

Assets versionados em `voice/v1.0.74/` acompanham o cache essencial do PWA. O modelo foi reiniciado e executado offline a partir dos caches reais do service worker nos dois projetos. O cache contém código/modelos; o armazenamento de documentos permanece independente.

## Validação

- 29 verificações novas por projeto: gesto inicial, permissão negada, constraints, cancelamento, captura interrompida, faixa encerrada no Safari, Worklet/alternativa e pausa de 2/3/5 s.
- Edge real: Web Audio + modelo real + controlador, nos dois projetos, com Worklet a 48 kHz e alternativa a 44,1 kHz; ruído antes/depois da fala e escuta silenciada antes da resposta.
- WebKit real: modelo/worker/WASM e cache offline. O port Windows usado pelo Playwright não fornece Web Audio/getUserMedia; a captura do Safari foi validada por contratos simulados, sem afirmar teste físico em iPhone.
- Suítes de backup, restauração, arquivos/códigos de compartilhamento, importação, ritmos, marcação de tempo, responsividade e contratos protegidos de armazenamento passaram. Google Drive usa serviços simulados nos testes.

O layout próprio de cada plataforma foi preservado. O APK e os downloads do site não são alterados por esta integração.
