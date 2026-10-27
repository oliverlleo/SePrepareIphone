# SePrepare 1.0.64 — diagnóstico, implementação e validação

## Diagnóstico e decisão de armazenamento

A auditoria foi registrada antes das alterações, junto com as medições `performance64-before.json`.

- Android: SQLite, com o caderno JSON na linha `state`. A gravação existente, a validação e as cópias de recuperação foram preservadas. Gravações idênticas são encerradas antes da análise e escrita; o cálculo nativo mantém seu executor fora da interface. Não houve migração do banco.
- Windows/Web: IndexedDB, checkpoints, diário local e proteção de concorrência por Web Locks. O caderno confirmado é reutilizado pela sincronização. A checagem de bytes idênticos precede a validação repetida, sem retirar as travas, revisões ou recuperação de falhas.
- Apple: OPFS + IndexedDB e proteções próprias do host, mantendo autenticação, gate de dispositivos, instalação, edição, gestos, iPad/Mac e atualização. O contrato das cinco funções protegidas passou; a versão Android não substituiu o host Apple.

Os maiores desperdícios estavam no recálculo completo de assinaturas, normalização, clonagem e reconstrução de dados já idênticos. A fila de rede também possui intervalos próprios: dez segundos entre requisições e verificação remota periódica. Os tempos de CPU abaixo não são tempos de internet.

## Mudanças efetivas

- SHA-256 determinístico por conteúdo, versão, discurso, card e conjunto. Identidades distintas continuam distintas mesmo com texto e nome iguais.
- Índice incremental com fontes JSON exatas, cache persistente separado e selo de integridade. O cache é opcional e reconstruível, com limite aproximado de 32 MiB de entradas, até três revisões por nó e expurgo LRU. Esse limite foi escolhido após medir descarte prematuro no cenário de 500 discursos com o limite inicial de 8 MiB.
- Web Worker para o índice web, agrupamento de solicitações iguais, fila e fallback local. Cache ausente, corrompido, negado ou travado não impede o uso dos dados. No Android, índice nativo e persistência atômica do cache.
- Reutilização de snapshots do editor até um evento real de alteração; gravações idênticas evitadas. O JSON já confirmado é repassado ao controlador de sincronização, com a origem da operação.
- Comparação de assinaturas antes de restaurar. Cópias equivalentes encerram o planejamento sem reconstruir o caderno. Comparação detalhada e cópia sob escrita concentram-se nos itens diferentes.
- Recuperação remota da mesma identidade substitui essa identidade quando a base comum comprova ausência de edição local. Não produz uma alternativa “· Drive” apenas por ter recebido a atualização.
- Conflitos verdadeiros continuam exigindo escolha. Drive somente reproduz o backup selecionado, Local preserva o aparelho e Ambos conserva diferenças reais, com identidades determinísticas para não repetir alternativas ao receber a mesma cópia.
- Preservação de versões inativas, nomes divergentes, notas privadas, formatação, participantes, histórico e ensaios. A combinação de campos não descarta registros locais de ensaio ou histórico.
- Rascunhos recebidos conservam o texto confirmado. Conflitos entre rascunhos preservam os dois conteúdos; a importação JSON também leva seus metadados, remapeando identidades quando cria cópias.
- Preferências protegidas e vocabulário passam por comparação de três vias. Tema, idioma e preferências locais de voz/revisão continuam locais. Conflitos reais de ajustes não são resolvidos silenciosamente. A escolha Ambos preserva catálogos de ritmos divergentes e remapeia as marcações da cópia recebida.
- Registro mínimo de exclusão definitiva, contendo identidades e hashes, sem guardar texto apagado. Impede que uma cópia antiga ressuscite o discurso, inclusive quando era o último. Edição concorrente com exclusão exige decisão. A lixeira continua com sua retenção existente.
- Checkpoints automáticos redundantes gerados pela formatação são removidos ao desfazer e voltar ao conteúdo correspondente. Históricos existentes, não marcados como automáticos, permanecem preservados.
- Compatibilidade com backups antigos, inclusive identidades estáveis na migração de arquivos sem versões. Recibos antigos são reconstruídos com base em dados conferidos.

## Formato e quatro cópias

O backup continua um JSON completo, usando o envelope compatível `backupSchema: 1`, com SHA-256 do arquivo. Foram medidos tamanho e CPU de GZIP nível 1 no relatório incremental. A compactação reduz bastante estes textos repetitivos, mas acrescenta processamento e exigiria um novo caminho de leitura nos aparelhos existentes. Sem medição real de rede/aparelhos que justifique essa troca, foi mantido o JSON compatível e já minimizado no envio automático. Nenhum formato binário, backend ou serviço novo foi introduzido.

As quatro cópias completas permanecem. Os testes cobrem falhas de upload, de confirmação, listagem incompleta, paginação, metadados inválidos, cópias concorrentes e falha na limpeza. A limpeza depende da confirmação da nova cópia e é adiada quando não existe evidência segura para excluir.

## Resultados antes e depois

Mesmo computador, Node, cargas de 1/5/20/100/500 discursos e três versões por discurso; três amostras por medição, mediana. As plataformas nesta tabela representam seus módulos de produção executados no Node, não medições em celulares físicos. A comparação idêntica posterior usa cache aquecido; o custo do primeiro índice é mostrado separadamente.

| Plataforma | Discursos | Recuperação idêntica antes (ms) | Depois (ms) | SHA reutilizado (ms) |
|---|---:|---:|---:|---:|
| Android | 1 | 1.723 | 0.082 | 0.016 |
| Android | 5 | 6.964 | 0.165 | 0.012 |
| Android | 20 | 17.512 | 0.443 | 0.010 |
| Android | 100 | 89.369 | 2.328 | 0.009 |
| Android | 500 | 425.037 | 10.455 | 0.008 |
| Windows | 1 | 1.520 | 0.075 | 0.013 |
| Windows | 5 | 5.457 | 0.162 | 0.013 |
| Windows | 20 | 17.122 | 0.356 | 0.011 |
| Windows | 100 | 74.107 | 1.588 | 0.007 |
| Windows | 500 | 377.287 | 10.432 | 0.008 |
| Apple | 1 | 1.506 | 0.073 | 0.027 |
| Apple | 5 | 5.560 | 0.107 | 0.012 |
| Apple | 20 | 16.614 | 0.582 | 0.010 |
| Apple | 100 | 76.581 | 1.714 | 0.007 |
| Apple | 500 | 375.766 | 9.867 | 0.008 |

### Primeiro índice e edição incremental

| Plataforma | Discursos | Primeiro índice sem cache (ms) | Uma versão editada (ms) | SHA novos | Versões analisadas | Cache aproximado (MiB) |
|---|---:|---:|---:|---:|---:|---:|
| Android | 1 | 1.962 | 0.697 | 6 | 1 | 0.05 |
| Android | 5 | 6.456 | 1.073 | 6 | 1 | 0.16 |
| Android | 20 | 19.547 | 2.306 | 6 | 1 | 0.59 |
| Android | 100 | 96.509 | 8.544 | 6 | 1 | 2.89 |
| Android | 500 | 451.087 | 38.841 | 6 | 1 | 14.50 |
| Windows | 1 | 1.739 | 0.826 | 6 | 1 | 0.05 |
| Windows | 5 | 5.589 | 0.957 | 6 | 1 | 0.16 |
| Windows | 20 | 20.408 | 2.379 | 6 | 1 | 0.59 |
| Windows | 100 | 100.099 | 7.969 | 6 | 1 | 2.89 |
| Windows | 500 | 417.233 | 38.279 | 6 | 1 | 14.50 |
| Apple | 1 | 1.460 | 0.656 | 6 | 1 | 0.05 |
| Apple | 5 | 5.198 | 0.861 | 6 | 1 | 0.16 |
| Apple | 20 | 16.925 | 2.031 | 6 | 1 | 0.59 |
| Apple | 100 | 85.253 | 9.157 | 6 | 1 | 2.89 |
| Apple | 500 | 409.446 | 37.538 | 6 | 1 | 14.50 |

O primeiro índice exige mais trabalho que o SHA único anterior: é necessário criar as assinaturas por entidade e seus ancestrais. Esse custo inicial não foi ocultado. A vantagem recorrente está em reutilizar o índice e analisar apenas a versão alterada. Nos 100 discursos, os outros 99 mantiveram suas assinaturas. O cenário de 500 também terminou com seis hashes novos e uma versão analisada após uma edição.

O relatório incremental contém CPU separada do tempo de parede, amostras, memória inicial/final, ocupação aproximada do cache, GZIP e atraso de event-loop como proxy. Variações de heap incluem coleta de lixo e não demonstram, isoladamente, economia de memória. O limite do cache não inclui o caderno principal, snapshots atuais e alocações transitórias.

Ainda existe serialização completa quando o formato de persistência ou backup exige JSON completo. Após uma edição, o scanner percorre limites dos bytes JSON; isso evita normalizar e recalcular textos inalterados, mas não transforma toda a operação em custo constante. Quando o cache é expulso ou indisponível, o índice é refeito a partir dos dados, com custo inicial novamente.

## Verificações executadas

- Android: 279 verificações dos 13 conjuntos existentes e 37 cenários incrementais, sincronização, rascunhos e configurações; compilação oficial de release e assinatura original conferida.
- Windows: build completo e suíte `npm test`, incluindo persistência, concorrência entre abas, falhas, OAuth simulado, reconexão, fila, retenção, recursos offline, PWA desktop, editor, ajustes, ritmos, versões, notas, compartilhamento e os 37 novos cenários.
- Apple: 322 cenários/verificações reportados pelo agregador, incluindo identidade das funções protegidas, build reproduzível, autorizações simuladas, retenção e os novos cenários. A integração continua adaptada ao host Apple. O build é conferido duas vezes, incluindo o Worker novo.
- Paridade do código Java real de SHA/cache com JavaScript: 42 verificações de estados, cards e dados relevantes, incluindo backup apenas com exclusão, Unicode e números. Cache persistido e cache adulterado também exercitados.
- Nove cenários adicionais de cache IndexedDB e falha do Worker nas três plataformas.
- Dez ciclos A → Drive → B → Drive → A nas três implementações, sem versões de transferência nem reenvio quando os dados já coincidem.
- Recuperação idêntica repetida, alteração única, desfazer, configurações locais, conflitos verdadeiros, cada escolha de recuperação, identidades independentes, importação JSON e arquivos antigos.

Os testes usam contas, HTTP, eventos de armazenamento e relógios simulados quando necessário. Não foi usado Google Drive real de uma pessoa. A validação Java usa o código real do índice e uma biblioteca JSON de teste; não substitui um teste de instalação em Android físico.

## Limitações verificáveis

Não houve nova conferência visual nesta tarefa: o navegador recusou as páginas locais e a orientação do usuário foi concluir com os testes disponíveis. Não se declara teste físico de Android, iPhone, iPad, Mac ou fluidez de interface nesses aparelhos. O layout e a navegação não foram redesenhados. A leitura local da primeira tabela mede parse/validação do JSON; não mede latência física de SQLite, OPFS ou IndexedDB de um celular. A responsividade preserva os estilos existentes e passou nos contratos/testes de estrutura disponíveis.

Android conserva o modelo local completo e seus mecanismos de compartilhamento, importação e atualização. O APK usa `br.com.orador.app`, versão 1.0.64, código 65, certificado original e build sem depuração. Não é necessário desinstalar para atualizar. As chaves de assinatura não acompanham o ZIP.
