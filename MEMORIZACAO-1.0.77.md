# Memorização inteligente — SePrepare 1.0.77

## Usar

No menu do discurso, escolha **Memorizar**, logo após **Apresentar**. Na Apresentação, use o seletor do cabeçalho para alternar entre os dois modos. Demonstrações conservam o ensaio interativo atual.

Na primeira entrada, gere cartões ou crie um manualmente. Confira as perguntas, palavras-chave e trechos de origem. É possível editar, dividir, unir, excluir e ordenar cartões antes de começar. O discurso permanece intacto.

No estudo, tente explicar a ideia. Peça pistas gradualmente e revele o trecho quando desejar. Avalie **Não lembrei**, **Com ajuda** ou **Lembrei sozinho**. As avaliações organizam a revisão espaçada; cartões difíceis podem ser revisados separadamente. Ao reabrir, o conjunto e a sessão são conservados.

## Motor local

O motor interpreta a estrutura do Delta, incluindo títulos, parágrafos, listas e destaques. Usa limites de frases, conectivos e relações explícitas para identificar conceitos, etapas, comparações, exemplos, causas e conclusões. As palavras-chave são extraídas literalmente. Perguntas usam modelos controlados; sem evidência suficiente, o cartão pede a ideia ou uma lacuna literal.

O MiniLM existente fornece similaridade entre ideias próximas. Ele não escreve perguntas, respostas ou explicações. A mesma instância de Worker é carregada sob demanda para análise/formatação e cartões. Há cancelamento, limite de entradas e fallback leve quando o modelo está indisponível. O estudo funciona sem internet, API de IA ou reconhecimento de voz.

## Dados e sincronização

- Formato comum: `version.memorization`, schema 1, sem incluir o Delta ou uma resposta inteira em cada cartão.
- Âncoras contêm posições UTF-16, assinatura do trecho e pequenos contextos. Formatação isolada conserva o progresso. Trechos editados são reassociados somente quando a evidência é segura; ambiguidades exigem conferência.
- Cartões têm IDs estáveis, edições com data e exclusões persistentes. Avaliações são eventos com ID único, data, nota e assinatura da evidência. A união é determinística e idempotente, preservando registros de ambos os aparelhos.
- O progresso participa da assinatura do backup, mas não da identidade do texto. Estudar não cria versões do discurso. Restaurações e importações completas conservam o progresso.
- Compartilhamento em arquivo ou código mantém o comportamento existente e exclui cartões e histórico de aprendizado por padrão.
- Alterações independentes de texto e aprendizado são combinadas. Não são modificados os controladores de autenticação, captura de voz ou a proteção contra duas abas gravando ao mesmo tempo.

## Navegação e apresentação

A entrada na Memorização solicita confirmação se áudio ou cronômetro estiverem ativos. A confirmação pausa ambos e conserva tempo acumulado, ensaio, página e posição possível de leitura. O retorno nunca reinicia a reprodução ou o cronômetro automaticamente. A seta respeita a origem: Caderno, Editor ou Apresentação. O modo Foco continua ocultando o cabeçalho.

Os cartões usam as cores, fontes e componentes do SePrepare. Há entrada suave, revelação animada e suporte à preferência de movimento reduzido. Celular usa uma coluna; telas maiores usam duas colunas na gestão e um cartão centralizado no estudo. Rótulos foram acrescentados aos catálogos em inglês, espanhol e japonês.

## Verificação

- `node verify-memorization.mjs`: geração fundamentada, âncoras, alterações de texto/formatação, revisões, versões, merge, repetição de restauração, privacidade e texto longo.
- `qa/verify-memorization-ui.mjs` / `tests/verify-memorization-ui.mjs`: dois acessos, geração e cancelamento, edição manual, divisão/união/exclusão/ordem, estudo, pausa de ensaio, volta à leitura, Demonstrações, reabertura, versões, largura de 320px a desktop e movimento reduzido. Usa dados fictícios e bloqueia serviços externos.
- Regressões existentes de backup, restauração, compartilhamento, importação, voz, leitura, ritmo, marcações de tempo e interface.
- MiniLM real: vetores locais de 384 dimensões nos três pacotes. Java e JavaScript produziram SHA-256 idênticos para caderno sem cartões, com cartões, com avaliação e com exclusão.
- WebKit verificou atualização do PWA antigo para o novo e reabertura offline preservando o caderno. Compilações Apple são idempotentes e os cinco contratos protegidos do host permanecem iguais.

Os testes usam Chromium/WebKit e ponte Android simulada. Não equivalem a instalação em aparelho físico ou sincronização com uma conta Google real. Limites de segurança: 2.000 cartões e 100.000 avaliações por conjunto; dados fora do formato são rejeitados pela validação existente.

## Compilar o Android

Versão 1.0.77, código 78, pacote `br.com.orador.app`. Java 17, SDK Android 35 e dependências em `web/package-lock.json`. Execute `npm ci` em `web` e `python build-apk.py` na raiz do projeto, com `JAVA_HOME` e `ANDROID_HOME` configurados.

A compilação verifica os modelos locais, a configuração do pacote e o certificado original. A chave e a senha originais continuam na pasta local `signing` do projeto de trabalho; não são distribuídas dentro do ZIP. O APK entregue já está assinado para atualização.
