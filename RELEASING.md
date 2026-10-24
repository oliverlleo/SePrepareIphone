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
