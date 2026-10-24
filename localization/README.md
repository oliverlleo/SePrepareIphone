# Idiomas da interface — 1.0.56

Em **Ajustes → Idioma do aplicativo**, o usuário escolhe Português (Brasil),
English, Español ou 日本語. A troca é imediata e a preferência fica no armazenamento
do próprio aparelho. O catálogo e as regras de interpolação são os mesmos da
versão web. As traduções funcionam sem conexão e sem serviços de tradução.

O recurso traduz somente textos da interface. Documentos, títulos, participantes,
categorias, versões, orientações privadas e códigos compartilhados são valores
opacos: não passam pelo tradutor. A revisão continua sendo de português; suas
substituições e seu dicionário não são traduzidos.

`i18n.js` contém o runtime e `i18n-catalogs.js` contém os três catálogos.
`shared.js` permite que o bundle de compartilhamento reutilize o mesmo runtime,
sem acrescentar outra cópia do catálogo ou depender de credenciais.

## Compilar

Na raiz do repositório:

```sh
npm ci --prefix sharing
npm run build --prefix sharing
npm ci --prefix localization
npm run build --prefix localization
```

O último comando insere o runtime, protegido contra inicialização duplicada, nos
entry points existentes `app.js` e `launch-gate.js`. É idempotente: substitui apenas
o trecho entre os marcadores `SEPREPARE LOCALE START/END`. Não recompila nem
substitui a base do app com código Android/web. Um HTML instalado antigo também
consegue abrir o `app.js` atualizado sem depender de um arquivo novo de tradução.

## Verificar

```sh
npm test --prefix sharing
node tests/i18n.test.mjs
node tests/portuguese-review.test.cjs
node tests/pwa-localization.test.cjs
```

O último teste preserva as verificações de redirecionamento do Safari, cache
completo antes da ativação e manutenção da versão anterior se um download falhar.
Ele não substitui uma verificação em iPhone físico.

Na publicação, mantenha `BUILD_ID` de `sw.js`, `data-seprepare-build` e os parâmetros
`?v=` de `index.html` iguais. O funcionamento do gate exclusivo do iPhone, memória
persistente, Drive e atualização automática permanece na base atual.
