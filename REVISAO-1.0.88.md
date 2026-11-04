# SePrepare 1.0.88 — Revisão offline em outros idiomas

Inglês e espanhol usam Hunspell com dicionários completos e flexões. Japonês usa textlint, Kuromoji e IPADIC para revisão de escrita; não é um corretor universal de todas as palavras japonesas.

O usuário escolhe o idioma do texto no modal Revisar e baixa somente o pacote desejado. O mesmo download fica em Ajustes → Idioma do aplicativo e Ajustes → Revisão de português. Português permanece incorporado. Não há conta, chave, API externa ou limite mensal. O primeiro download requer internet.

Tamanhos aproximados: inglês 0,6 MB, espanhol 0,9 MB, japonês 17,8 MB. O motor japonês acrescenta cerca de 0,54 MB de JavaScript; é iniciado somente na revisão japonesa, em worker, e encerrado após a resposta. O tokenizer usa memória temporária adicional enquanto analisa. Dados opcionais ficam no IndexedDB separado, fora do caderno e do backup. Se o navegador remover o armazenamento do site, será necessário baixar novamente. Palavras pessoais e correções lembradas continuam no formato do backup existente, isoladas por idioma.

Downloads verificam tamanho e SHA-256 antes da ativação. Cancelamento mantém arquivos completos já verificados para retomada. Exclusão remove somente os dados dos pacotes. Nenhuma sugestão internacional é aplicada automaticamente. O texto não é enviado a serviços de terceiros.

Licenças, versões e fontes: licenses/review/ e review-packs/v1.0.88/. Inglês MIT/BSD; espanhol distribuído sob MPL-1.1, com arquivos originais; textlint MIT; Kuromoji Apache-2.0 e aviso IPADIC preservado.

## Compilar Android

Use JDK 17 e SDK Android 35. Execute `npm ci --ignore-scripts` em `web` e em `web/review-tools`. Restaure a pasta privada `signing` original e execute `python build-apk.py` em `orador`. O ZIP não inclui chaves privadas. O APK fornecido já está assinado com o certificado original. A versão é 1.0.88 e o versionCode é 89.

Os arquivos opcionais do APK são obtidos exclusivamente em https://app.seprepareapp.com.br/review-packs/v1.0.88/. O WebView libera apenas esses dados; a CSP mantém scripts externos bloqueados. Os arquivos distribuídos devem permanecer disponíveis nesse endereço em atualizações futuras.

## Compilar Web/Windows e Apple

Windows: `npm ci --ignore-scripts` na raiz instala os workspaces e `npm run build` gera o site. Os packs ficam em resources/review e são copiados para dist, com CORS para o APK, sem integrar o download obrigatório do PWA.

Apple: `npm ci --prefix review --ignore-scripts`, além das instalações descritas em RELEASING.md. `node protection/verify-all.mjs` reconstrói e verifica o app, incluindo `review/build.mjs`. O worker e o pequeno motor são recursos do PWA; os dicionários opcionais permanecem fora do cache geral para evitar cópias duplicadas.
