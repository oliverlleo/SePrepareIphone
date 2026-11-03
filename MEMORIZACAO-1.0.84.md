# SePrepare 1.0.84 — Ideias completas e relações no contexto

O motor anterior tratava limites de parágrafo como conclusões e oferecia quase apenas nomes como candidatos. Isso permitia separar uma introdução de sua citação e escolher o nome do personagem em vez da relação discutida. A correção atua nessas duas etapas, compartilhadas pelo Android, Windows/Web/PWA e Apple/PWA.

## Divisão e seleção

- Continuação sintática liga determinantes pendentes, introduções com dois-pontos, parênteses e citações abertas. A leitura dos delimitadores é incremental, inclusive em citações longas.
- Pontuação interna de uma citação e ponto e vírgula não encerram automaticamente seu raciocínio. Perguntas podem acompanhar respostas elípticas ou semanticamente relacionadas.
- Participantes e turnos de demonstração permanecem separados. Títulos, listas e ideias completas sem relação conservam seus limites.
- Candidatos incluem conceitos nominais, estados, comparações e predicados. Auxiliares, negação e clíticos são preservados quando necessários ao sentido.
- O contraste afirmado recebe prioridade sobre a introdução da oposição. Atribuição e nomes de atores recebem menos peso quando há uma relação mais informativa.
- Expressões que apenas reproduzem uma ação longa recebem uma penalização contextual. A escolha não impõe um número fixo de palavras; conceitos compactos competem com relações essenciais.
- Formas verbais, particípios e compostos com clíticos são derivados dos mesmos corpora UD licenciados. Não há lista de personagens, livros ou correções específicas de um discurso.

## Custo e dependências

Mantidos o MiniLM quantizado e o classificador existentes. Nenhuma nova API, biblioteca de execução, modelo neural ou serviço foi adicionado. A geração continua no worker e usa representações dos mesmos tokens para comparar os candidatos, sem uma inferência por candidato. Resultados completos e trechos não alterados continuam em cache; cancelamento e limites de origem permanecem ativos. A morfologia acrescenta metadados locais ao classificador, não outro carregamento de IA. A licença e a proveniência UD acompanham a compilação.

## Dados e atualização

O marcador opcional `reasoningRevision: 1` atualiza o banco antigo ao começar um treino. Cartões antigos, conceitos editados e avaliações são preservados. Quando uma unidade muda de divisão, o histórico anterior não é atribuído indevidamente às novas unidades. Estudar não cria versão do discurso. O formato lógico é o mesmo nas três plataformas e o compartilhamento normal continua excluindo histórico pessoal.

## Verificação

Executadas as suítes existentes das três plataformas e 14 novas verificações de raciocínio, morfologia, polaridade, limites, migração e idempotência. A bateria com MiniLM real cobre 50 passagens de assuntos e idiomas variados. O texto enviado pelo usuário também foi conferido localmente, sem publicá-lo como dado de teste. Testes de interface e cobertura usam Chromium e WebKit em cinco perfis; não equivalem a testes em aparelhos físicos. Backup e serviços Google usam dados fictícios/simulações; nenhuma conta pessoal foi alterada.

O motor continua extrativo e pode produzir sugestões que exigem revisão. Os testes não medem precisão universal. A edição manual e a divisão dos cartões permanecem disponíveis.

APK: versão 1.0.84, código 85, pacote br.com.orador.app, certificado original. APK e manifesto Android do site não são alterados por esta entrega. O manifesto JSON local fica pronto para o envio do APK ao endereço de release indicado nele.
