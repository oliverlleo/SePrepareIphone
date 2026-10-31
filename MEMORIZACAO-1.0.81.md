# SePrepare 1.0.81 — motor contextual de memorização

O treino mantém a tentativa antes da consulta. A frente do cartão apresenta conceitos que ajudam a lembrar uma ideia; o texto original permanece oculto até “Ver trecho”. Não há uma quantidade fixa de palavras para o conceito. Conceitos complementares podem aparecer separados por vírgulas.

## Como funciona

1. O Delta confirmado é lido com seus títulos, listas, parágrafos e limites de participantes. O editor e o discurso não são recriados nem modificados pela geração.
2. Um classificador gramatical contextual, treinado com Universal Dependencies, identifica candidatos nominais. A frequência no documento e no corpus ajuda a distinguir conceitos específicos de palavras genéricas.
3. O MiniLM já distribuído compara conteúdo e orientações de apresentação. Referências isoladas são tratadas separadamente. Casos ambíguos são conservados e sinalizados para conferência, em vez de descartados silenciosamente.
4. A segmentação considera continuidade de significado, anáforas, exemplos e explicações. Um título comum não basta para juntar tudo; tampouco toda frase vira obrigatoriamente um cartão. Participantes e turnos não são misturados.
5. Os vetores dos candidatos são obtidos dos tokens da própria passagem, na mesma inferência. Relevância, cobertura e diversidade selecionam os conceitos. Não se transforma automaticamente o início do parágrafo em título, nem se corta uma frase para cumprir uma quota de palavras.
6. A pista usa uma relação e uma associação extraída do trecho. O original só aparece por ação do usuário. A geração é extrativa: não utiliza um modelo generativo, serviço de IA ou API remota.

## Desempenho

O processamento ocorre no worker. Os pesos gramaticais novos (~6,5 MB sem compressão) ficam nesse worker; não são carregados pela tela de gerenciamento. O MiniLM existente é reutilizado. Há cache limitado de análises e de passagens, reutilização das passagens inalteradas, cancelamento e limites de recursos. Abrir uma rodada com cartões válidos não executa novamente o motor.

Se o encoder não estiver disponível, o worker ainda usa a análise gramatical local e marca os conceitos como provisórios. Eles podem ser conferidos e a análise pode ser refeita posteriormente. Não se apresenta esse resultado como equivalente à análise semântica completa.

Nos cenários curtos medidos no computador de desenvolvimento, a primeira carga do modelo levou cerca de quatro segundos; análises seguintes ficaram aproximadamente entre 40 e 150 ms. Esses valores não representam medições em Android ou iPad físicos, nem garantem o tempo de textos longos.

## Dados e compatibilidade

O esquema de memorização permanece compatível, com campos opcionais para conceitos, confiança, origem contextual e edição manual. Cada banco continua vinculado à versão do discurso. A mesma passagem pode reutilizar sua identidade e histórico; uma divisão ambígua cria identidades novas, sem atribuir aos filhos o domínio do cartão anterior. Os cartões e avaliações antigos são preservados.

Formatação visual não invalida a análise textual. A publicação da geração confere novamente a origem e mescla progresso recebido durante o processamento. Estudar não cria versões do discurso. O merge de backup preserva avaliações e exclusões, é idempotente e impede que uma cópia antiga substitua metadados mais novos. O compartilhamento comum continua sem aprendizado pessoal.

Implementação compartilhada em Android, Windows/Web/PWA e Apple/PWA. Os adaptadores de áudio, login, sincronização e navegação de cada plataforma permanecem os existentes. Não houve publicação de APK nem alteração do manifesto Android no site nesta entrega.

## Treinamento e licenças

O classificador perceptron foi treinado com os corpora UD Portuguese-Bosque, English-EWT, Spanish-GSD e Japanese-GSD. Pesos e tabelas derivados são distribuídos sob CC BY-SA 4.0, com créditos, licenças originais, hashes e proveniência em `third_party/context-pos` no Android, `resources/licenses/context-pos` no Windows e `licenses/context-pos` no Apple. A licença dos derivados permite utilização comercial, observadas suas condições. Não foi incluído um LLM adicional.

Os scripts de treinamento e as fontes estão documentados em `qa/context-training`. A compilação comum usa os pesos prontos e não baixa nem treina corpora. Os testes de qualidade do aplicativo não foram usados no treinamento gramatical.

## Validação e limites

- 25 testes novos de contexto, cache, cancelamento, migração, edições, referências, dados, merge, backup e privacidade, além dos 85 testes anteriores de memorização.
- Regressões completas de Android e Windows; suíte Apple com 553 verificações e build idempotente.
- Fluxos de interface em Chromium e WebKit, com cinco perfis, larguras de 320 px ao desktop, temas claro/escuro, movimento reduzido, versões, participantes, retorno ao editor, pausa do ensaio e áudio.
- Cenários com MiniLM real e rede externa bloqueada; comparação de 30 passagens variadas, incluindo casos corrigidos durante o desenvolvimento. Essa coleção é uma regressão de qualidade, não uma estimativa estatística de precisão semântica.
- Paridade SHA-256 do índice nativo Java e JavaScript em seis estados de aprendizado.
- Atualização/offline do PWA Apple e preservação dos recursos de backup, importação e compartilhamento pelas suítes existentes.

Não foram usados aparelho físico ou conta Google real. A qualidade de conceitos continua sujeita a ambiguidades do texto e ao modelo extrativo. A edição manual e o indicador de conferência permanecem disponíveis. As verificações detalhadas acompanham os relatórios da entrega.
