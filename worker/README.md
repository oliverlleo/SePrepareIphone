# Renovação do Drive na hospedagem existente

Este Worker atende somente `/api/drive/*`; os demais caminhos continuam nos ativos
estáticos originais. Ele não recebe nem guarda discursos. A autorização Google é
cifrada num cookie do próprio site. Não utiliza KV, banco de dados ou outro servidor.

## Ativação

1. Publique o código e os ativos com `npx wrangler deploy`. O domínio continua
   `https://ios.seprepareapp.com.br`. Enquanto faltarem os segredos, a configuração
   responde `enabled:false` e o aplicativo preserva a conexão anterior.
2. No cliente OAuth Web do projeto Google já usado pelo app, confirme a origem
   JavaScript `https://ios.seprepareapp.com.br`. No modelo de código com popup, a
   troca usa essa mesma origem como `redirect_uri`. Se necessário, cadastre essa
   URI no cliente. Não redefina o segredo de um cliente compartilhado com PC ou Android.
3. Adicione **segredos de execução do Worker**, não variáveis públicas nem variáveis
   de compilação: `GOOGLE_CLIENT_SECRET` e `DRIVE_AUTH_KEY`.
   O primeiro é o segredo do cliente Web indicado em `wrangler.jsonc`. O segundo
   deve ser uma chave aleatória de 32 bytes codificada em base64url, sem `=`.
   Gere e insira os valores num ambiente seguro; não envie por chat, Git ou arquivo
   público. `wrangler secret put NOME` solicita o valor sem incluí-lo no comando.
4. Verifique `/api/drive/config`: deve informar `enabled:true`, o cliente público,
   o escopo privado do Drive e `hasSession:false` antes da primeira autorização.
5. No PWA instalado, autorize uma vez. Confira a cópia, feche/reabra o app e teste
   novamente após a expiração do acesso. O consentimento inicial continua sendo
   uma ação do usuário; a renovação posterior não abre janelas.

Se for escolhido um cliente Web exclusivo para iPhone, mantenha o mesmo projeto
Google para preservar a área privada do Drive e atualize somente `GOOGLE_CLIENT_ID`
e seu segredo correspondente. Confira o estado de publicação do consentimento:
autorizações de aplicativos externos em teste podem ter validade reduzida.

## Limites e proteção

- Cookie cifrado, autenticação AES-GCM, nonce aleatório, chave somente na Cloudflare.
- Credencial vinculada à origem, ao cliente OAuth e à conta confirmada pelo Drive.
- POST exige origem exata, JSON e cabeçalho próprio. Não há CORS de terceiros.
- Respostas privadas com `no-store`; o service worker não intercepta esses caminhos.
- Sem credenciais em URLs, mensagens de erro, logs, localStorage ou IndexedDB.
- Limites de corpo, tamanho de resposta, validade e tempo das chamadas ao Google.
- Acesso temporário fica em memória. O cookie pode conter uma cópia cifrada para
  evitar renovação desnecessária. A autorização durável tem limite de 180 dias,
  renovado durante o uso e limitado também pelo vencimento informado pelo Google.
- Trocar `DRIVE_AUTH_KEY` invalida os cookies existentes e exige nova autorização.
- Desconectar limpa este cookie; não chama a revogação global do Google, que pode
  afetar outras plataformas do mesmo aplicativo.

Testes locais usam somente credenciais fictícias. O certificado HTTPS de teste
fica em `tests/qa-output/`, não é instalado no computador e não é publicado.

Referências: [modelo por código do Google](https://developers.google.com/identity/oauth2/web/guides/use-code-model),
[OAuth para aplicativos Web](https://developers.google.com/identity/protocols/oauth2/web-server) e
[Worker com ativos estáticos](https://developers.cloudflare.com/workers/static-assets/).
