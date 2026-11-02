# SePrepare 1.0.82 — entrega final

Esta versão inclui o motor contextual da 1.0.81 e o ajuste das ferramentas de edição solicitado depois.

## Formatação durante a digitação

Negrito, itálico, sublinhado, tachado, fonte, tamanho, cor e marca-texto usam a seleção real do editor. Se houver trecho selecionado, somente ele muda. Com o cursor parado, o estilo é ativado para o que será digitado, sem alterar o texto anterior. Desativar o botão encerra o estilo. O cursor também acompanha os movimentos silenciosos que o Quill realiza durante a edição, evitando inserir no lugar antigo.

Lista, alinhamento e outros estilos de parágrafo afetam a linha do cursor ou as linhas selecionadas. Sem seleção, inserir link coloca o endereço no cursor; com seleção, transforma apenas o trecho em link. A ferramenta Limpar estilo no menu respeita a seleção ou a digitação no cursor. Maiúsculas/minúsculas exigem seleção. Selecionar tudo continua permitindo aplicar um estilo ao documento completo.

A formatação inteligente e a revisão conservam seus controles explícitos de aplicação ao texto. O botão Desformatar associado à análise continua removendo a formatação do alcance indicado. Nenhuma ferramenta comum passa a usar o documento inteiro implicitamente.

## Memorização

O motor usa conceitos nominais escolhidos pelo contexto, sem quota fixa de palavras, com o original oculto, pistas e evolução adaptativa. Inclui o tratamento das contrações dos corpora UD para impedir que palavras funcionais contraídas sejam sugeridas como conceitos. Os bancos da revisão anterior são atualizados uma vez, preservando edições e avaliações vinculadas às mesmas passagens. Detalhes da arquitetura, licenças e limites estão em MEMORIZACAO-1.0.81.md.

## Verificações

- 110 testes de memorização, além das regressões completas de Android, Windows e Apple.
- 55 verificações de edição com Quill real em cinco perfis: cursor, seleção, ativar/desativar, estilos, links, listas, limpeza, editor vazio e persistência ao salvar/reabrir.
- Fluxos de memorização e responsividade em cinco perfis, temas claro/escuro e tamanhos de celular a desktop.
- MiniLM real e recursos locais, com rede externa bloqueada; 30 passagens de regressão, sem interpretar esse conjunto como uma medida estatística de precisão.
- Backup, restauração, compartilhamento, importação e contratos de armazenamento cobertos pelas suítes existentes; seis estados do índice Java/JavaScript e atualização/offline Apple.

Android 1.0.82, código 83, pacote br.com.orador.app, assinado com o certificado original. ZIP exclui chave privada e inclui fontes, modelos e licenças. Testes em navegadores, WebKit e simulações nativas, sem aparelho físico ou conta Google real. APK e manifesto Android do site permanecem sem alteração nesta entrega.
