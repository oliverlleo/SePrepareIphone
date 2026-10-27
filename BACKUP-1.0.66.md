# SePrepare 1.0.66 — edição e backup

## Falhas reproduzidas e correções

1. A interface de envio reutilizava a rotina de recuperação. Quando o planejamento preferia a cópia remota, confirmar um backup executava commitRestore antes de enviar. Agora existe um caminho exclusivo de envio, com ticket e hash do conteúdo local; esse caminho não faz merge nem chama commitRestore/drivePrepareRestore.
2. A recuperação manual transformava toda diferença entre documentos em conflito, inclusive quando a base comum demonstrava uma mudança unilateral. A interface agora respeita o planejamento de três vias. Sem base suficiente ou com edições concorrentes, a escolha continua necessária.
3. A ausência de rascunho remoto era avaliada antes da base comum, conservando um rascunho local antigo sobre uma confirmação remota posterior. A base dos rascunhos agora participa da decisão antes desse atalho. Rascunho novo versus confirmação concorrente pede escolha.
4. No Android, editorUnpublished sozinho criava um rascunho redundante ao abrir uma preparação. A gravação de rascunho agora exige diferença real de conteúdo; o botão Salvar continua confirmando publicações.
5. Nos clientes web, notificação de gravação sem JSON e retorno ao primeiro plano agora invalidam o snapshot em memória. A leitura seguinte consulta o caderno atual. O índice incremental, workers e cache persistente continuam ativos.

## Comportamento preservado

O Android continua separando rascunho automático de texto confirmado para apresentação. O botão Salvar confirma o conteúdo atual e remove o rascunho equivalente. Windows e Apple conservam seus armazenamentos, fluxos de edição e adaptações originais. O contrato protegido do host Apple é verificado no build.

A confirmação manual revalida o caderno, conta, ticket e cabeça remota. Se algo mudar durante a prévia/espera, é necessária uma nova confirmação. O envio automático mantém pendências e tentativas após falhas, sem marcar uma edição posterior como enviada por causa de uma requisição anterior. SHA-256 do card corresponde ao conteúdo daquela edição confirmado em uma cópia; não significa que todos os aparelhos já recuperaram essa cópia.

Continuam as quatro cópias, tombstones de exclusão, metadados de versões, formatação, notas, participantes, ensaios, ritmos, dicionário e compatibilidade JSON. A janela de 10 segundos entre envios concluídos permanece; não existe pausa obrigatória entre HTTPs do mesmo backup.

## Verificação

- Novos testes executam a interface real de backup com DOM mínimo, dados fictícios e bridge controlada. Reproduziram a restauração indevida e o conflito artificial antes da correção.
- Fluxo completo com o controlador web real e transporte Google simulado: 1 → 12, envio manual, recuperação em B sem eco, falha de rede, edição durante envio, invalidação de snapshot e troca de cabeça remota.
- Funções reais de persistência e Salvar do editor Android executadas com editor e armazenamento simulados: sem edição, documento não publicado, rascunho alterado, confirmação, desfazer e falha de armazenamento.
- Suítes completas Android, Windows e Apple; testes Java usam controlador e transporte de produção com servidor HTTP local e facades Android/Google isoladas.

Limites: sem aparelho físico, login real Google, teste real entre duas contas/aparelhos ou nova validação visual nesta tarefa. A evidência cobre lógica, transporte simulado, build, assinatura e integridade. A autorização anterior foi para concluir com as verificações disponíveis; não foi contornado o bloqueio do navegador.
