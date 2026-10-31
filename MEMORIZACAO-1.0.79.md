# Memorização por ideias — SePrepare 1.0.79

A geração agora abre o primeiro cartão diretamente. Cada cartão mostra uma ideia principal, até três palavras-chave e um trecho original de apoio, que pode ser mostrado ou ocultado. Anterior e Próximo funcionam sem exigir avaliação. Lembrei e Preciso revisar são marcações opcionais e não repetem o cartão na mesma rodada.

Cada nova entrada começa uma rodada diferente, selecionada do conteúdo disponível e apresentada em ordem lógica. Combinações já usadas são evitadas quando há outras disponíveis. Textos curtos podem repetir ideias. Dentro da mesma entrada, Voltar à rodada conserva a posição; reabrir Memorizar começa outra rodada e mantém o histórico anterior.

## Demonstrações

Memorizar também está no menu e no seletor da Apresentação das Demonstrações. É possível escolher Somente minhas falas, Todas as falas ou um conjunto de participantes.

Os trechos usam as marcas reais de participante no Delta, inclusive quando a marca muda no meio da linha. Cartões não atravessam falas de pessoas diferentes. Reatribuir uma fala, sem modificar as palavras, também atualiza a origem da geração e invalida vínculos antigos incompatíveis.

O ensaio interativo é pausado antes da mudança, liberando o microfone. Vez, página e cronômetro são conservados; o retorno não retoma áudio, escuta ou contagem automaticamente.

## Minha evolução

O histórico da versão ativa mostra data, estado da rodada, quantidade de cartões, lembrados, itens para revisar e cartões sem avaliação. O percentual usa somente os cartões avaliados e corresponde à autoavaliação da pessoa. Avançar ou mostrar o texto não registra acerto.

Nas Demonstrações, os resultados são separados por conjunto de participantes. Um filtro permite consultar grupos já estudados sem criar outra rodada. Rodadas anteriores são carregadas progressivamente. Avaliações antigas permanecem em uma seção própria, sem inventar resultados de rodadas não registrados no formato anterior.

## Motor e desempenho

O motor agrupa raciocínios dentro de parágrafos e partes relacionadas, em vez de gerar um exercício para cada frase. Títulos, palavras-chave, destaques e contexto orientam a seleção. O banco reutilizável possui até 48 ideias e cobre o começo e o final do texto. Cada rodada usa até oito cartões.

O MiniLM local auxilia a similaridade entre ideias; não é usado como modelo generativo. O banco é reaproveitado nas novas entradas. Variar a rodada não exige carregar novamente o modelo. A alternativa determinística funciona sem internet ou modelo disponível.

Em um teste de desktop com 35.190 caracteres, o banco de 48 ideias foi gerado em aproximadamente 50 ms sem o modelo. Esse número não representa o carregamento do MiniLM nem o desempenho de um aparelho físico.

## Dados e preservação

O formato continua em **version.memorization**, schema 1, com campos opcionais:

- **card.idea** e **card.speakerId** identificam a apresentação por ideias e a fala de origem.
- **ideaSource** identifica texto e atribuição dos participantes. Formatação visual isolada não muda essa origem.
- **ideaRounds** conserva seleções, referências aos cartões, cursor, avaliações e conclusão. O texto inteiro não é duplicado por cartão ou rodada.

Cartões, perguntas editadas, avaliações e sessões antigas são preservados. A edição nova aceita assunto e palavras-chave opcionais e sugere campos vazios. Dividir, unir, ordenar e excluir continuam no gerenciamento; falas de pessoas diferentes não podem ser unidas.

O merge une rodadas e avaliações por IDs, conserva o cursor mais recente e rejeita seleções incompatíveis com o mesmo ID. Exclusões permanecem registradas. Estudar não cria versões do discurso. Copiar versões gera conjuntos independentes; duplicar uma preparação limpa o aprendizado pessoal, conforme o comportamento anterior.

Backup, restauração, importação completa e sincronização usam o mesmo formato nas três plataformas. Compartilhamento comum em arquivo ou código exclui cartões e histórico pessoal.

## Verificação e compilação

O pacote inclui os testes do motor anterior, dos novos dados e dos fluxos de interface. São verificados geração direta, navegação livre, novas rodadas, evolução, participantes, preservação do ensaio, rascunhos, versões, temas e responsividade.

Os testes usam Chromium/WebKit, dados fictícios e ponte Android simulada. Verificações do Drive usam simulações; não representam conta Google real ou instalação em aparelho físico.

Android: versão **1.0.79**, código **80**, pacote **br.com.orador.app**. Use Java 17 e SDK Android 35; execute npm ci em web e python build-apk.py na raiz. Os modelos completos acompanham o projeto. A compilação confere o certificado original; chave e senha permanecem na pasta local signing, fora do ZIP distribuído. O APK entregue já está assinado para atualização.
