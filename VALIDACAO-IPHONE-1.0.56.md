# SePrepare iPhone 1.0.56 — validação e situação

Base: `oliverlleo/SePrepareIphone`, commit `4a75aa42cf5384a3833b6e9d9652cbb92a04e577`.
Identificador do PWA preparado: `20261024.1`.

## Pronto nesta etapa

As melhorias de backup das versões 1.0.54 e 1.0.55 e a confirmação imediata das
nuvens foram integradas à base própria do iPhone. Foram mantidos o editor, a memória
OPFS/IndexedDB, a instalação exclusiva do iPhone e o mecanismo de atualização existente.

- Backup por alteração real, agrupamento, intervalo mínimo de 10 segundos e novas tentativas após falhas temporárias.
- Controles independentes, ligados por padrão em novas preferências, nas opções avançadas.
- Comparação de conteúdo real, cópias próprias e idênticas reconhecidas, conflitos preservados como versões.
- Nuvem por card atualizada na confirmação, antes da limpeza do histórico.
- Quatro pontos de recuperação com proteção de cópias concorrentes.
- Ajustes e recuperação em telas legíveis, com altura limitada à área visível em retrato e paisagem.
- Conta e escolhas anteriores migradas sem apagar os registros antigos.
- Retomada de uma autorização temporária ainda válida, inclusive antes de carregar a biblioteca Google.
- Tratamento de HTTP 401, resposta ausente, callback atrasado, BFCache e interrupção da primeira conexão enquanto há uma edição local.
- Autorização por código e renovação protegida pelo Worker existente, com cookie cifrado e HttpOnly, sem banco de dados ou transferência de discursos pela hospedagem.

## Evidência

Comando executado: `node protection/verify-all.mjs --ui`.

**240 verificações aprovadas:** 219 verificações de núcleo, proteção, autorização,
integração e compilação, mais 11 cenários completos de interface, 4 de atualização
entre versões e 6 de renovação protegida com HTTPS no WebKit.

O teste de atualização inicia o bundle original, edita e confirma a gravação,
disponibiliza a nova versão ao mesmo PWA e aguarda a atualização automática. Em
seguida compara discursos, versões, categorias e vocabulário, confirma a migração
da conta e das duas preferências desligadas e reabre offline com a versão nova.

As cinco rotinas originais de memória persistente, inicialização, confirmação de
gravação, validação e salvamento local foram comparadas com a base por hash. Os
pontos de integração documentados não substituem essas rotinas. Compilar novamente
produz os mesmos arquivos.

A interface foi exercitada em larguras 375, 390, 430 e 844, com temas claro/escuro e
português, inglês, espanhol e japonês. Os catálogos têm 1.848 mensagens por idioma.

OAuth e Drive foram simulados com dados fictícios. O WebKit executou armazenamento,
service worker e atualização reais, com identidade e dimensões de iPhone simuladas.
O tráfego externo foi bloqueado também por um proxy local de teste. Não houve teste
em iPhone físico nem login em conta Google real.

Relatórios e capturas locais ficam em `QA-drive-iphone-*.json` e
`tests/qa-output/drive-iphone/`; esses arquivos não são publicados.

## Ativação da renovação protegida

O PWA atual usa o modelo de token do Google e não possui refresh token. Uma sessão
ainda válida pode ser reaproveitada; após expirar ou ser perdida pelo iOS, o Google
pode exigir um gesto para emitir outra autorização. Repetir a janela silenciosa não
elimina essa exigência.

A autorização por código e a renovação estão implementadas em `worker/` e
`protection/cloudflare-authorization.js`. Os testes HTTPS usam o handler real,
cookies reais e a interface do aplicativo, com o Google simulado. Cobrem primeira
autorização, perda da sessão temporária, expiração, recusa HTTP 401, indisponibilidade
com novas tentativas e desconexão preservando os discursos.

A ativação na hospedagem exige `GOOGLE_CLIENT_SECRET` e `DRIVE_AUTH_KEY` como
segredos de execução, além da origem Google correta. Os valores não fazem parte
do projeto nem da publicação. Sem eles, `/api/drive/config` responde
`enabled:false` e o fluxo anterior é preservado. A instrução completa está em
`worker/README.md`. O empacotamento Cloudflare foi validado sem publicação.

Depois de configurada a hospedagem, é necessária uma autorização inicial no PWA
instalado. A renovação posterior não depende de janelas ou gestos comuns. Revogação
do Google, limpeza do site e vencimento do consentimento ainda podem exigir nova
autorização. Isso não permite que o iOS execute continuamente um PWA fechado.

Referências: [modelo de tokens](https://developers.google.com/identity/oauth2/web/guides/use-token-model),
[modelo por código](https://developers.google.com/identity/oauth2/web/guides/use-code-model) e
[armazenamento dos web apps no iOS](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/).
