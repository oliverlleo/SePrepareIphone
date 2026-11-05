# SePrepare 1.0.91 — Reprodução e novo design dos ensaios

O botão **Ouvir** aparece ao lado de **Gravar** quando existe uma gravação acessível da preparação e versão atuais. Antes da primeira gravação dessa versão, permanece oculto. Ele abre uma faixa na própria Apresentação, com pausar/continuar, linha do tempo interativa, posição, duração, velocidade e atalhos de dez segundos. **Outros áudios** abre diretamente Ensaios desta versão. O player não altera o texto nem cria ensaios ou versões.

O modal Ensaios desta versão foi redesenhado: título e versão aparecem uma única vez, a lista é plana, as gravações têm hierarquia de título/data/duração/status, e as ações secundárias ficam no menu de cada áudio. Busca por preparação, filtro de tipo e painéis de backup permanecem na biblioteca geral dos Ajustes. A seleção em lote só aparece quando solicitada. Os ensaios sem áudio ficam em uma seção recolhida. Compartilhamento, consulta ao texto, exclusão e acesso à biblioteca geral foram preservados.

O layout usa as cores, as fontes e os ícones existentes, com espaçamento e proporções próprios para a nova composição. A faixa se adapta à barra lateral do Windows e às telas de celular/tablet; nomes ficam compactos quando necessário, mantendo descrição acessível. Todos os textos novos existem nos quatro idiomas.

Há somente um player de gravações ativo. Iniciar uma gravação ou sair da preparação encerra a reprodução; mudar de versão não reproduz o áudio da anterior. Ouvir uma gravação pausa a narração e o cronômetro em andamento. O indicador do botão respeita a gravação mais recente disponível naquela versão, inclusive após restauração ou exclusão.

Armazenamento, formato dos backups, assinaturas dos arquivos, compartilhamento e importação permanecem iguais aos da versão 1.0.90. Também foi eliminado um segundo intervalo de renovação do bloqueio do gravador, para liberar corretamente o acesso ao terminar o ensaio.

Validação: suítes existentes, testes de armazenamento/sincronização, interfaces em Chromium e WebKit e revisão visual dos resultados. Chromium usa áudio sintético com MediaRecorder real; WebKit no ambiente Windows usa adaptador explícito por não oferecer os recursos de captura. Sem aparelho físico ou conta Google real.

Android 1.0.91, código 92, assinado com o certificado original. SePrepareApp e SePrepareIphone permanecem na branch codex/rehearsal-recordings-90, com PRs em rascunho, sem mesclar nem publicar APK/manifesto no site.
