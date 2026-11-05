# Gravação dos ensaios — 1.0.90

## Uso
No modo Apresentação, o microfone **Gravar** fica ao lado do cronômetro. A permissão e a captura são abertas antes de iniciar o tempo. Pausar/continuar o cronômetro pausa/continua a gravação. Encerrar salva um novo ensaio: áudios anteriores não são substituídos. Uma gravação iniciada durante um ensaio registra também o deslocamento inicial.

O seletor de versões oferece **Ensaios desta versão**. O áudio é reproduzido dentro da lista, com velocidade, voltar/avançar dez segundos, compartilhamento explícito e consulta ao texto utilizado. O texto é uma captura da versão no início do ensaio, independente de edições posteriores. A barra existente de seis ferramentas foi mantida.

Em Ajustes → Dados e segurança → Gravações dos ensaios, as preparações são agrupadas por versão. Há busca, filtro de tipo, espaço local, seleção em lote e exclusão de um áudio, uma versão ou uma preparação. Excluir áudio preserva texto, versões e registros de duração. O modo Foco usa somente um indicador no cronômetro existente.

## Armazenamento e Drive
Áudio, metadados e capturas de texto ficam fora do JSON do caderno. Os textos utilizados são deduplicados por SHA-256. Cada gravação tem identidade própria. Não há mudança no esquema de discursos, versões, importação ou compartilhamento. Compartilhar uma preparação não inclui gravações pessoais; compartilhar áudio exige a ação específica.

No Drive, a proteção dos áudios é separada do backup de texto e usa a autorização privada já existente, sem escopos novos. **Proteger e recuperar gravações** sincroniza o catálogo e protege os áudios locais; áudios remotos são baixados quando solicitados. A opção de proteção automática fica nesse painel. O JSON de backup de texto não transporta os arquivos de áudio.

A remoção somente deste aparelho exige uma cópia confirmada no Drive. A exclusão definitiva mantém um registro de exclusão para evitar reaparecimento, inclusive quando ocorre durante um envio. Exclusões pendentes são aplicadas ao reconectar a conta correspondente.

## Plataformas
Android reutiliza a captura do microfone do ensaio interativo, mantém um journal PCM e converte para AAC/M4A com os recursos do sistema; WAV é o fallback recuperável. Transferências não bloqueiam os comandos do microfone. Web/PWA usa MediaRecorder com detecção de suporte a MP4/AAC ou WebM/Opus, chunks em IndexedDB e uma captura compartilhada com trilhas independentes para o detector de fala. Permissão negada não inicia o cronômetro.

Ao sair de primeiro plano, o aplicativo finaliza a gravação disponível; ao sair da apresentação ou trocar de versão, oferece salvar antes de continuar. O armazenamento recupera journals/chunks persistidos após interrupção. Não há gravação oculta em segundo plano.

## Validação e publicação
Testes de contrato, concorrência, journal nativo, suítes existentes e perfis de interface nos quatro idiomas. Chromium usa gravação/reprodução reais de áudio sintético. O WebKit do ambiente Windows usa adaptador de mídia, pois não disponibiliza Web Audio/captura; não equivale a um iPhone físico. Conta Google e dispositivos físicos não foram usados.

As alterações Web e Apple pertencem à branch `codex/rehearsal-recordings-90`. **Não mesclar ou publicar em produção sem uma nova instrução.** APK e manifesto do site não foram alterados. A chave de assinatura original não acompanha o ZIP.
