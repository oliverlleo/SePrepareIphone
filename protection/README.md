# Proteção do Drive no iPhone — 1.0.56

Adaptação das melhorias 1.0.54–1.0.55 e da confirmação imediata das nuvens à base
existente do PWA do iPhone. A memória persistente, o editor, o gate de instalação,
o compartilhamento, os idiomas e o mecanismo de atualização permanecem na base original.

- Backup por alteração real, com agrupamento e pelo menos 10 segundos entre requisições ao Drive.
- Novas tentativas após falhas temporárias, sem esperar dias nem bloquear o salvamento local.
- Backup e recuperação ligados por padrão em novas preferências; escolhas anteriores explicitamente desligadas são respeitadas.
- Nuvem no lado direito da linha Parte/Discurso, atualizada após a confirmação da cópia, antes da limpeza do histórico.
- Ajustes compactos, controles independentes e ações manuais nas opções avançadas.
- Comparação de conteúdo, formatação, anotações, versões e dados gerais. Cópias idênticas e próprias não provocam outra recuperação.
- Conflitos reais preservam as três escolhas e os textos alternativos.
- Quatro pontos de recuperação distribuídos no tempo, preservando cópias concorrentes ainda não conferidas.
- Migração da conta e das preferências antigas sem apagar os registros anteriores.

## Reconexão no iPhone

A versão anterior mantém um access token temporário em `sessionStorage`. Sua função
de retorno chama `initTokenClient().requestAccessToken()` novamente depois da expiração.
Não há refresh token nem serviço de renovação. O fluxo de token do Google pode exigir
um gesto do usuário, e o PWA instalado tem um contexto de armazenamento próprio no iOS.

A adaptação conserva a credencial temporária ainda válida e confirma a identidade pelo
Drive. A retomada funciona inclusive antes de carregar a biblioteca Google. Também
trata expiração, HTTP 401, retorno pelo BFCache, resposta ausente e callbacks atrasados.
Uma primeira conexão interrompida enquanto o usuário edita não grava uma conta incompleta.

Com a configuração da hospedagem concluída, a primeira conexão usa o modelo por
código do Google. O Worker troca esse código e guarda a autorização durável num
cookie cifrado com AES-GCM, Secure, HttpOnly e SameSite=Strict, vinculado à origem e
ao cliente Google. A chave fica num segredo da Cloudflare; o JavaScript não recebe
o refresh token. Não é necessário banco de dados, e os discursos continuam sendo
transferidos diretamente entre o PWA e a área privada do Google Drive.

Ao reabrir ou expirar o acesso, o PWA consulta o Worker e renova a autorização sem
abrir a interface Google. Falhas temporárias conservam a conta e recebem novas
tentativas com espera progressiva. O cancelamento real da autorização, a limpeza
dos dados do site ou o vencimento do consentimento Google podem exigir nova
autorização. O iOS também pode suspender o PWA fechado; a retomada ocorre ao abrir.

Contas anteriores recebem uma ação de autorização única para ativar a renovação.
Uma credencial temporária válida continua utilizável durante a migração. A ausência
dos segredos mantém o fluxo anterior disponível e não anuncia renovação protegida.
Depois de ativada, uma indisponibilidade não faz o app voltar a abrir janelas por
toques comuns. A desconexão elimina somente o cookie deste PWA, sem revogar a
autorização de outros dispositivos. Veja `../worker/README.md` para ativação.

Fontes: [modelo de tokens do Google](https://developers.google.com/identity/oauth2/web/guides/use-token-model),
[modelo por código e renovação no backend](https://developers.google.com/identity/oauth2/web/guides/use-code-model)
e [armazenamento próprio de web apps no iOS](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/).

## Compilação e testes

Veja `../RELEASING.md`. `build.mjs` aplica integrações específicas por AST e para se
não encontrar exatamente os pontos esperados. A compilação repetida deve produzir
os mesmos arquivos. `verify-host.mjs` confere a integridade das rotinas originais de
memória, gravação, inicialização e validação, descontando apenas os pontos de integração
documentados e diferenças de quebras de linha.

Os relatórios `QA-drive-iphone-*.json` e capturas em `tests/qa-output/drive-iphone/`
são locais e não fazem parte da publicação. Google/OAuth/Drive são simulados. O
armazenamento, o service worker e a atualização entre versões são reais no WebKit de teste.
