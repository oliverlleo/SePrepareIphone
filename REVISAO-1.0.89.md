# SePrepare 1.0.89 — Seleção das correções e idioma da revisão

- Selecionar todas e Desmarcar todas ficam antes da lista de sugestões.
- Selecionar todas inclui apenas sugestões com substituição disponível e respeita a proteção de citações, incluindo sugestões que cruzam parcialmente uma citação.
- Selecionar não altera o texto. Aplicar selecionadas continua sendo a confirmação da alteração.
- A alternativa escolhida manualmente é mantida. Desmarcar todas funciona também após marcações individuais. Novos resultados assíncronos seguem a escolha de seleção feita pelo usuário.
- Selecionar correções seguras permanece separado. A confiança dos motores não foi promovida artificialmente.
- O título dos Ajustes, dos resultados da busca e do modal acompanha o idioma do texto escolhido. Os menus podem estar em espanhol enquanto a revisão está em português.
- O resumo e os controles do painel acompanham o idioma escolhido. As opções de revisão online portuguesa são mostradas somente para português.
- Os dicionários pessoais continuam separados por idioma no formato existente do backup. Salvar, alterar ou esvaziar um idioma preserva palavras e correções lembradas dos outros. Entradas portuguesas antigas permanecem disponíveis.
- Os pacotes offline continuam na versão de dados 1.0.88; não é necessário baixar novamente os mesmos dicionários.

## Verificação

12 contratos novos de seleção, proteção, títulos e preservação dos dicionários. Testes de interface em Chromium/WebKit com dados fictícios cobrem seleção, aplicação, quatro idiomas, menus em espanhol com texto em português, salvamento dos quatro dicionários e reabertura. Suítes existentes executadas. Não houve teste em aparelho físico nem uso de conta Google pessoal.

## Compilação Android

JDK 17 e SDK Android 35. Instale dependências com npm ci --ignore-scripts em web e web/review-tools. Reutilize a pasta privada signing original e execute python build-apk.py. Versão 1.0.89, código 90. O ZIP não inclui chave privada. O APK entregue já está assinado.
