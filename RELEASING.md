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
