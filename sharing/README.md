# Compartilhamento por código — SePrepare 1.0.40

Abra **Compartilhar → Gerar código** na preparação. Marque as versões que deseja enviar; a ativa vem selecionada por padrão. Somente as marcadas entram no código. Se a ativa ficar fora, a primeira selecionada será a ativa recebida, sem mudar a escolha no aparelho de origem. Use **Copiar mensagem** ou **Compartilhar**. Anotações privadas só entram se essa opção for marcada.

A mensagem inclui instruções e o endereço https://seprepareapp.com.br/baixar/. Quem recebe pode copiar e colar a mensagem inteira, com links e textos extras: somente o código validado é importado. Quem recebe toca no ícone de importar ao lado do tema, escolhe **Usar código**, usa **Colar código copiado** ou cola no campo e toca em **Conferir preparação**. A prévia permite consultar todas as versões, escolher categoria e participante, manter ou remover o agendamento recebido, cancelar ou salvar. Conferir outra versão não muda a versão ativa enviada. Confirmar cria uma nova preparação com novas identificações; nada existente é substituído.

**Usar arquivo** mantém a importação anterior de arquivos, textos e backups. Compartilhar como texto, arquivo ou código usa a versão ativa por padrão. Escolher versões oferece os três formatos. Texto simples recebe somente o link de download depois do conteúdo; arquivo recebe instruções breves e o link, inclusive na mensagem da intenção Android. Navegadores sem compartilhamento de arquivos oferecem o download e uma mensagem copiável para enviar junto.

## Dados portáveis

Título, referência, Delta com os estilos suportados (fontes, cores, negrito, marcador, listas, citações, páginas etc.), participantes e falas de cada versão, nomes e conteúdo das versões, versão ativa, modo de páginas, tempo previsto e ajustes de leitura. Também são incluídos categoria com ícone/cor, fixação, agendamento e lembretes. A prévia oferece a opção de remover o agendamento.

Anotações e âncoras só são incluídas por escolha explícita. A identificação pessoal de participante e o filtro Minhas falas continuam locais. Conta/tokens do Google, ajustes gerais do app, vocabulário pessoal, cronômetros, ensaios e histórico de restauração não são enviados.

## Formato comum

`SEPREPARE:1:<tamanho UTF-8 em base36>:<CRC32 de 8 dígitos hexadecimais>:<zlib em base64url sem padding>`

Payload JSON: format `seprepare-share-code`, schema 1, speech, category (ou null) e includesNotes booleano. speech.versionSchema permanece 1. As três plataformas usam os mesmos módulos share-code.js, share-code-ui.js e share-message.js e fflate 0.8.2 local, sob MIT. O código contém o próprio conteúdo; não depende de banco, URL, servidor ou busca remota. Não expira. CRC32 detecta erro de cópia e não é autenticação nem criptografia.

A mensagem usa os delimitadores [INÍCIO DO CÓDIGO SEPREPARE] e [FIM DO CÓDIGO SEPREPARE]. O importador reconhece o bloco, ignora o texto externo e também aceita códigos antigos avulsos. Duas preparações no mesmo texto pedem importação separada. O decodificador estrito do formato permanece compatível.

O decodificador valida schema, checksum, tamanho, versão ativa, participantes e estilos. A descompactação é limitada durante o fluxo a 12 MB. Códigos acima de 60 mil caracteres continuam copiáveis, com orientação para preferir arquivo quando a mensagem for extensa; não existe truncamento ou envio parcial.

## Salvamento e compatibilidade

Somente após confirmação uma nova preparação é inserida no armazenamento existente. Uma categoria idêntica pode ser reutilizada e uma categoria recebida pode ser criada, sem alterar as atuais. Se a gravação falhar, a nova preparação e categoria são desfeitas e a prévia permanece para nova tentativa. Os ensaios importados começam zerados. Todas as versões importadas são reconhecidas como salvas pelo editor.

Android mantém pacote e assinatura originais. Drive continua com quatro cópias, restauração automática e conflitos preservados. Web mantém IndexedDB, proteção de outra aba, PWA desktop e instalação dedicada. iPhone mantém OPFS/IndexedDB, cópias locais, lançamento instalado, regras de dispositivo e correções recentes do Service Worker e da atualização segura. Os modelos locais e motores de revisão não foram alterados.

## Recompilar a integração

Execute `npm ci`, `npm run build` e `npm test` dentro de sharing. O builder preserva o bundle próprio do iPhone e seus mecanismos de memória, atualização e abertura. Siga RELEASING.md ao mudar o identificador de publicação.
