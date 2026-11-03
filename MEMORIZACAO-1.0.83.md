# SePrepare 1.0.83 — contexto e cobertura integral

## Correções

O treino anterior escolhia até oito cartões, aproximadamente 60% do banco; a geração também reduzia bancos grandes a 48 ideias. A ordenação posterior não recuperava o conteúdo omitido. As duas seleções de rodada agora usam todas as ideias ativas da versão e do escopo escolhidos, em ordem de origem. O banco contextual não faz mais amostragem de 48 itens. Os níveis de desafio podem conectar ideias, mas não retiram partes para criar variação.

A identificação de fontes numéricas usa posições, estrutura da referência e análise gramatical. Não há catálogo de livros nem exceção para a frase da imagem. Os tokens de uma referência não competem como conceitos. Uma proposição que menciona uma fonte conserva seus conceitos substantivos; uma chamada de leitura fica como contexto do argumento correspondente, sem virar cartão independente.

O classificador semântico local diferencia conteúdo, ilustração retórica, instrução, saudação, transição e referência. Introduções hipotéticas são conteúdo; não basta começarem com uma forma imperativa para serem descartadas. Os exemplos de ilustrações são descrições de situações variadas, comparadas pelo MiniLM existente, sem API ou modelo generativo adicional.

Títulos, chamadas e outros apoios são associados às ideias usando os limites originais das unidades. A atribuição acontece antes de expandir os trechos, evitando duplicações ou sobreposições quando um título e uma referência aparecem consecutivamente. Parágrafos formatados como título que contêm proposições completas continuam sendo conteúdo. Passagens idênticas em posições diferentes mantêm identidades distintas quando são unidades distintas.

A atualização automática do banco usa um campo opcional de revisão de cobertura. Os cartões antigos e suas avaliações são conservados; referências geradas incorretamente deixam de compor o banco automático ativo. Edições manuais e exclusões são preservadas. A atualização não cria uma versão do discurso nem modifica o Delta.

Se o worker falhar, o aplicativo não substitui o banco por uma extração lexical silenciosa. Se o encoder estiver indisponível mas o worker funcionar, continua existindo a análise gramatical local sinalizada como provisória. Sem modelo semântico, isso não equivale à análise contextual completa. Limites de armazenamento geram uma falha íntegra; não retornam discretamente uma parte do banco.

## Verificação

- 13 regressões novas: frase exata da imagem, outras fontes, referência dentro de uma proposição, introdução narrativa, texto com estilo de título, apoios consecutivos, passagens repetidas, cem ideias sem amostragem, vinte sessões com cobertura completa, dificuldade sem retirada de conteúdo, limite de armazenamento e preservação de histórico.
- 110 regressões anteriores de memorização mantidas; expectativas antigas que exigiam retirar ideias foram substituídas por cobertura integral e identidades independentes de sessão.
- 38 passagens com MiniLM real e rede externa bloqueada. Além dos conceitos, a verificação confere a função dos trechos e a cobertura. Essa coleção é uma regressão, não uma medida estatística de precisão semântica.
- Teste de interface com modelo real e um discurso de 25 ideias: primeiro cartão na introdução, referência como apoio, todos os caracteres do original presentes, sem sobreposição, percurso completo e nova sessão sem omissões. Perfis de Android, Windows, iPad, iPhone e macOS, com Chromium/WebKit e temas claro/escuro.
- Fluxos existentes de versões, demonstrações, participantes, pausa de ensaio/áudio, retorno ao editor e responsividade. Contratos de armazenamento, backup, restauração, importação e compartilhamento preservados pelas suítes completas e pela paridade Java/JavaScript do índice.

Os testes usam dados fictícios e a frase fornecida na imagem; o discurso original completo do usuário não foi fornecido. Não foram utilizados aparelho físico ou conta Google real. O motor continua extrativo, com edição manual disponível para ambiguidades; não se afirma compreensão perfeita de qualquer texto.

## Distribuição

Android 1.0.83, código 84, pacote br.com.orador.app, certificado original e alinhamento de 16 KB. A implementação é compartilhada com Windows/Web/PWA e Apple/PWA, preservando as adaptações das plataformas. ZIP inclui fontes, modelos, licenças e testes; chave privada excluída. APK e manifesto Android do site não são alterados nesta entrega. O JSON fica preparado para a publicação do arquivo correspondente.
