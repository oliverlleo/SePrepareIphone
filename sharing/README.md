# Compartilhamento por código — SePrepare 1.0.39

Abra **Compartilhar → Gerar código** na preparação. O código inclui todas as versões e mantém qual está ativa. Use **Copiar código** ou **Compartilhar**. Anotações privadas só entram se essa opção for marcada.

Quem recebe toca no ícone de importar ao lado do tema, escolhe **Usar código**, usa **Colar código copiado** ou cola no campo e toca em **Conferir preparação**. A prévia permite consultar todas as versões, escolher categoria e participante, manter ou remover o agendamento recebido, cancelar ou salvar. Conferir outra versão não muda a versão ativa enviada. Confirmar cria uma nova preparação com novas identificações; nada existente é substituído.

**Usar arquivo** mantém a importação anterior de arquivos, textos e backups. Compartilhar como texto/arquivo continua usando a versão ativa por padrão; Escolher versões continua disponível.

## Dados portáveis

Título, referência, Delta com os estilos suportados (fontes, cores, negrito, marcador, listas, citações, páginas etc.), participantes e falas de cada versão, nomes e conteúdo das versões, versão ativa, modo de páginas, tempo previsto e ajustes de leitura. Também são incluídos categoria com ícone/cor, fixação, agendamento e lembretes. A prévia oferece a opção de remover o agendamento.

Anotações e âncoras só são incluídas por escolha explícita. A identificação pessoal de participante e o filtro Minhas falas continuam locais. Conta/tokens do Google, ajustes gerais do app, vocabulário pessoal, cronômetros, ensaios e histórico de restauração não são enviados.

## Formato comum

`SEPREPARE:1:<tamanho UTF-8 em base36>:<CRC32 de 8 dígitos hexadecimais>:<zlib em base64url sem padding>`

Payload JSON: format `seprepare-share-code`, schema 1, speech, category (ou null) e includesNotes booleano. speech.versionSchema permanece 1. As três plataformas usam os mesmos módulos share-code.js e share-code-ui.js e fflate 0.8.2 local, sob MIT. O código contém o próprio conteúdo; não depende de banco, URL, servidor ou busca remota. Não expira. CRC32 detecta erro de cópia e não é autenticação nem criptografia.

O decodificador valida schema, checksum, tamanho, versão ativa, participantes e estilos. A descompactação é limitada durante o fluxo a 12 MB. Códigos acima de 60 mil caracteres continuam copiáveis, com orientação para preferir arquivo quando a mensagem for extensa; não existe truncamento ou envio parcial.

## Salvamento e compatibilidade

Somente após confirmação uma nova preparação é inserida no armazenamento existente. Uma categoria idêntica pode ser reutilizada e uma categoria recebida pode ser criada, sem alterar as atuais. Se a gravação falhar, a nova preparação e categoria são desfeitas e a prévia permanece para nova tentativa. Os ensaios importados começam zerados. Todas as versões importadas são reconhecidas como salvas pelo editor.

Android mantém pacote e assinatura originais. Drive continua com quatro cópias, restauração automática e conflitos preservados. Web mantém IndexedDB, proteção de outra aba, PWA desktop e instalação dedicada. iPhone mantém OPFS/IndexedDB, cópias locais, lançamento instalado, regras de dispositivo e correções recentes do Service Worker e da atualização segura. Os modelos locais e motores de revisão não foram alterados.

## Recompilar a integração

Execute `cd sharing && npm ci --ignore-scripts && npm run build && npm test`. O builder identifica os pontos de integração no bundle iPhone atual e interrompe se forem ambíguos. É idempotente. Não substitua o app.js por builds de Android ou desktop. Ao publicar futuras mudanças, siga RELEASING.md para atualizar o identificador de index.html e sw.js sem apagar os dados.
