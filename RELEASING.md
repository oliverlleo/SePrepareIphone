# Atualização shell 20261125.2

Corrige o logotipo do cabeçalho do guia público de instalação (`apple-install-guide.js`) para usar `branding/logo-light.png` sobre o fundo claro (`#fffefa`).

# Atualização shell 20261125.1 (SEO)

Metadados descritivos (`<title>` e `<meta name="description">`) e diretiva `<meta name="robots" content="noindex, follow">` adicionados em `index.html`, concentrando o ranqueamento na página oficial [https://seprepareapp.com.br/](https://seprepareapp.com.br/).

# Atualização 1.2.0 — shell 20261123.3

Consolida Entrevistas no Editor/Apresentação (catálogo local de 146 perguntas em 12 áreas e 4 idiomas, botão inteligente `+ Pontos sugeridos` com rolagem, modo Manual/Automático, Ajustes sob demanda e correção de autosave), filtro compacto de categorias na linha da 1ª seção do Caderno, botão de ocultar barra de ferramentas no modo expandido (com botão translúcido e retorno em 2 puxadas), Marcar tempo com seleção Pelo ritmo/Tempo manual (segurar altera), edição no selo da margem, cálculo cumulativo, ativação imediata do 1º selo visível (verde em folga, vermelho apenas no atraso) e versão alinhada para `1.2.0`, preservando os rótulos em linha única e o editor expandido limpo do shell `20261121.1`.

# Editor expandido — shell 20261121.1

Cabeçalho recolhido durante a edição expandida e segunda barra com nomes completos, sem quebra de palavras. A barra permite deslizar quando faltar espaço. Salvamento e gesto existente para mostrar o cabeçalho preservados. Fontes, testes e limites em [EDITOR-EXPANDIDO-20261121.md](EDITOR-EXPANDIDO-20261121.md).

# Atualização 1.0.101

Shell `20261120.3`. A Agenda mantém data e horário com opções de salvar, remover e exportar ao Calendário. O iPhone usa o Calendário para avisos. A exportação usa a data do formulário e o salvamento grava pela fila local. A tela de memória dá acesso direto a **Exportar backup** e **Cópias de recuperação**. Os textos foram revisados nos quatro idiomas.

Paridade de salvamento, compartilhamento e player integrada ao host Apple. Seletores Manual/Automático com círculos uniformes e títulos/descrições alinhados. `parity/` mantém o rascunho e aguarda a confirmação da fila IDB/OPFS. Código e arquivo individual só concluem a recepção após essa confirmação. Gate, migração, atualização segura, voz e Worker de autorização preservados.

O pipeline completo é `node protection/verify-all.mjs`; instale as dependências declaradas de sharing, localization, protection, pdf, review e qa/time-dom antes de executá-lo. O builder `parity/build.mjs` roda **por último**, depois de recordings. Compilação repetida e contrato das cinco funções protegidas aprovados. Não substituir o host pelo bundle de outra plataforma nem alterar o contrato para aceitar uma divergência.

O HTML e o service worker usam o mesmo identificador de shell. WebKit verifica a atualização da instalação anterior e a reabertura offline. O Calendário e o recebimento de alertas dependem de verificação em aparelho físico. A publicação ocorre pelo Cloudflare Workers Builds após mesclagem na main.

# Publicar uma atualização do PWA

Ao alterar o aplicativo, use um identificador novo de versão em ambos os lugares:

- `index.html`: atributo `data-seprepare-build` e todos os parâmetros `?v=`.
- `sw.js`: constante `BUILD_ID`.

Os valores precisam ser iguais. O `launch-gate.js` carrega `app.js` com a mesma
versão recebida no seu próprio endereço. Esse detalhe permite atualizar instalações
antigas que ainda usam o service worker anterior, sem apagar os dados do usuário.

Antes de publicar, confira uma migração real de uma instalação anterior, a abertura
offline e a preservação do caderno após atualização. A instalação do service worker
novo só deve concluir depois de baixar todos os arquivos essenciais dessa versão.

Uma tela antiga que já está aberta precisa de uma primeira abertura completa com
internet para receber este mecanismo. Depois disso, a verificação automática ocorre
ao voltar ao aplicativo, ao recuperar conexão e a cada cinco minutos enquanto ele
estiver em uso. A aplicação espera um momento sem edição, leitura, áudio, modal,
cronômetro em execução ou operação do Google Drive e exige a confirmação de gravação
na memória do aparelho.

## Traduções da interface

Ao alterar os catálogos, execute `npm run build --prefix localization` depois do
build de `sharing`. O runtime é incluído nos entry points existentes, sem nova
dependência para o HTML instalado antigo. Consulte `localization/README.md` e
execute também os testes de idiomas, do corretor e do service worker.

## Proteção do Drive — 1.0.56

A base do iPhone continua sendo `app.js`, com o armazenamento OPFS/IndexedDB e o
gate de instalação existentes. A proteção usa código mantido em `protection/`,
integrado por pontos pequenos no bundle original. Não substitua o aplicativo por
um build de PC ou Android.

Na raiz do repositório, prepare as dependências e compile nesta ordem:

```sh
npm ci --prefix sharing --ignore-scripts
npm ci --prefix localization --ignore-scripts
npm ci --prefix protection --ignore-scripts
node sharing/build.mjs
node localization/build.mjs
node protection/build.mjs
node rhythms/build.mjs
node enhancements/build.mjs
```

O último passo integra o controlador, as telas, a observação de salvamentos e as
nuvens dos cards. Também atualiza o guia de backup. Os arquivos compilados continuam
sendo publicados da raiz, pela configuração existente da Cloudflare.

Verificação completa, incluindo WebKit e atualização de uma instalação anterior:

```sh
node protection/node_modules/playwright/cli.js install webkit
node protection/verify-all.mjs --ui
git diff --check
```

Em Linux, prepare também as dependências de sistema exigidas pelo WebKit. Os testes
usam contas e discursos fictícios. WebKit com um perfil de iPhone não substitui a
verificação do login Google num aparelho físico.

O deploy agora inclui `worker/index.mjs` para a renovação protegida do Drive.
Configure os dois segredos de execução conforme `worker/README.md`. Os segredos
nunca entram na compilação nem nos ativos. O empacotamento foi validado com
`wrangler deploy --dry-run`; a configuração limita o Worker aos caminhos de autorização.

## Ritmos e interface — 1.0.58

`rhythms/` guarda o módulo compartilhado com Android/PC, os estilos e a integração AST ao bundle original do iPhone. Compile os cinco módulos na ordem indicada. O último passo adiciona os recursos sem substituir o gate, a memória, a voz ou a autorização do Drive. Os testes do host removem apenas os hooks identificados antes de conferir os hashes das funções originais.

Os testes novos usam o WebKit isolado, sem conexão externa. Para repetir a migração a partir da versão atual anterior, execute `UPGRADE_BASE=7fbfb9aaa9f63be225e178b33690753a3c0aea2a node protection/verify-iphone-upgrade.mjs` com esse commit disponível.

## Paridade Android 1.0.59 a 1.0.62

O quinto build (`enhancements/build.mjs`) precisa ser executado por último.
Ele integra busca, ajuda contextual, correções lembradas, destino da formatação
e Ajustes ao host Apple original. Usa as dependências de `sharing/` e publica
também `review-worker.js`. O código fonte de `enhancements/` não é um ativo público.

`node protection/verify-all.mjs` compila duas vezes, confere idempotência,
executa os testes puros e verifica as funções protegidas de memória/persistência.
Os testes `--ui` legados de 1.0.58 são auxiliares e não substituem o roteiro visual
da versão nova. O perfil Apple no Chromium não comprova Safari ou aparelho físico.
Antes de promover, conferir Safari/iOS instalado, teclado, voz, login e sincronização
com uma conta Google de teste. Não modificar a validação de instalação para testar.

## Paridade Android 1.0.67 a 1.0.70

Execute `node timing/build.mjs` depois dos cinco módulos anteriores. Este sexto passo registra os atributos de tempo, integra o cronômetro e os controles ao host Apple existente e embute seus módulos e estilos no app.js. Não substitui armazenamento, instalação, autorização ou voz. O build é idempotente e o contrato de memória original continua verificado.

Instale também `npm ci --prefix qa/time-dom --ignore-scripts` para os testes do aplicativo em DOM isolado. `node protection/verify-all.mjs` inclui a nova verificação. As fixtures de geometria não substituem Safari/iOS físico nem conferência visual de dispositivos. O build PWA desta versão é 20261028.70 em index.html e sw.js.

## Paridade final até 1.0.73

Incluídas as correções de distribuição/centralização e a ajuda contextual. Consulte PARIDADE-1.0.73.md. O identificador PWA final é 20261029.73; execute os seis builds pelo verificador.
