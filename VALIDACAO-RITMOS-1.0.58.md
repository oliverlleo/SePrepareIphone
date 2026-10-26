# Ritmos e interface — 1.0.58

Integração das funções Android 1.0.57/1.0.58 à base atual do iPhone: cadastro/edição/exclusão de ritmos, aplicação por trecho ou digitação, cálculo ponderado de tempo com análise, cores diferentes, traço como padrão e alternativa por nome, controle na apresentação e preservação em versões, arquivos e códigos. Categoria e opções de agendamento/ritmos ficam abaixo da versão para conferir. O importador de arquivos original também conserva os novos metadados.

O editor mantém os gestos existentes. O rodapé transparente continua na expansão, com Página e X. Ocultar afeta somente aquela expansão; o rodapé retorna no modo normal e na próxima expansão.

A integração usa `rhythms/build.mjs`, com pontos AST pequenos no bundle original. Permanecem as correções atuais de voz e autorização Google. A leitura assíncrona da memória do iPhone atualiza a paleta dos ritmos após carregar o caderno.

Verificações:

- `node protection/verify-all.mjs --ui`: 303 verificações aprovadas, incluindo compilação repetível, núcleo de ritmos/cores, codecs, idiomas, Drive, autorização simulada e WebKit com perfil de iPhone.
- Os hashes das funções originais de memória, inicialização/migração, gravação, validação e confirmação antes de atualizar continuam aprovados. A validação acrescenta somente o campo opcional de ritmos, com hook identificado.
- 33 verificações novas de interface no WebKit: Quill, seleção, próxima digitação/Enter, desfazer/refazer, persistência, cores, versões, importação real por arquivo/código, leitor, temas e rodapé.
- Atualização instalada a partir da base antiga `4a75aa4` e da main anterior `7fbfb9a`: ambas preservaram discursos, versões, última edição, conta e controles. A nova versão reabriu offline usando o service worker real.
- Interoperabilidade com APK e PC nas nove combinações de origem/destino, preservando metadados, versões e cores em arquivos e códigos.

Build do PWA: `20261025.1`, igual em HTML, URLs versionadas e service worker. Estilos e runtime dos ritmos estão embutidos no aplicativo, inclusive para shells instalados anteriores. `rhythms/` contém fontes e fica fora dos ativos publicados.

Telas reais foram inspecionadas em claro/escuro. Google foi simulado; não foi usado um iPhone físico nem uma conta real nos testes.
