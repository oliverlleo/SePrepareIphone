# Treino de memorização — SePrepare 1.0.80

O estudo agora segue a referência visual: tema central com até quatro palavras, progresso segmentado, Dar uma pista, Ver trecho e Consegui continuar. O trecho e as palavras-chave não aparecem antes da tentativa. Anterior e Pular continuam livres; Ainda difícil registra uma dificuldade explícita. Não há captação nem avaliação automática da voz.

## Motor local

O motor respeita parágrafos, títulos, relações entre trechos, listas e limites de participantes. A segmentação usa o serviço MiniLM local quando disponível e uma alternativa lexical leve. MiniLM não gera texto. O banco é limitado a 48 ideias distribuídas pelo discurso; cartões manuais e dados antigos são conservados.

O tema curto vem de títulos adequados, sujeitos nominais, conceitos quantificados e termos relevantes do trecho. A extração rejeita frases completas, transições como “Nesta parte” e combinações artificiais de palavras-chave. Temas manuais curtos são respeitados; temas antigos longos permanecem armazenados e recebem uma apresentação curta.

Pistas locais reconhecem contraste, causa e consequência, definição, sequência, exemplo e transferência de responsabilidade. Quadros de recuperação são usados somente quando existem marcas correspondentes no texto; cenários e relações ajudam a recordar sem copiar a conclusão. Há duas pistas progressivas. Não se trata de compreensão generativa irrestrita: trechos ambíguos usam uma orientação de reconstrução do raciocínio, sem inventar explicações. Pistas antigas que reproduzem a resposta não são exibidas automaticamente.

Gerenciar cartões permite editar, reorganizar, unir e dividir sem alterar o discurso. Dividir oferece limites entre frases para a pessoa escolher onde separar; não corta o texto no meio de palavras.

## Adaptação e espaçamento

Pedir pista, consultar o original e marcar dificuldade são gravados imediatamente. Continuar sem ajuda é uma autoavaliação de lembrança independente; continuar com pistas ou texto consultado registra ajuda. Pular não conta como sucesso. Voltar e continuar novamente não multiplica avaliações.

O treino seguinte prioriza dificuldades, ajuda recente e revisões vencidas; parte da seleção mantém cobertura das demais ideias. A ordem de apresentação segue o texto. Os intervalos de revisão são calculados pelo histórico de avaliações existente.

A progressão exige pelo menos duas sessões concluídas com 80% de autonomia, nenhuma dificuldade explícita e cobertura de 70% das ideias disponíveis: uma ideia, pares relacionados, seções e conjunto completo. Os agrupamentos dependem da estrutura disponível; temas sem ligação não são unidos só para aumentar o desafio. Uma sessão com dificuldade em mais da metade das ideias reduz um nível. Falas, versões e grupos de participantes mantêm progressão separada.

## Dados e compatibilidade

Schema 1 permanece. Campos opcionais: ideaEngine=2 e ideaBank no conjunto; training=2, level, groups e signals nas rodadas. Sinais possuem ID, data, índice e tipo. Trechos completos não são copiados para esses registros. Avaliações com ajuda usam rating=1, já suportado pelo histórico geral.

O merge une sinais e avaliações por IDs, preserva progresso e rejeita agrupamentos incompatíveis sob o mesmo ID. Cartões, avaliações e rodadas anteriores não são apagados. Estudar não cria uma versão do discurso. Compartilhamento comum continua excluindo aprendizado pessoal; backup completo preserva-o.

Mesma lógica no APK, Windows/Web/PWA e Apple/PWA. Os acessos, pausa do cronômetro/áudio/ensaio, página de leitura, rascunhos e seleção de participantes permanecem integrados.

## Verificação e compilação

- Motor: node web/verify-memorization.mjs, node web/verify-idea-rounds.mjs e node web/verify-adaptive-memory.mjs.
- Regressão: npm test no projeto Windows e npm --prefix web test no Android.
- Apple: node protection/verify-all.mjs.
- Interface: qa/verify-memorization-ui.mjs no Android/Windows; tests/verify-memorization-ui.mjs no Apple. ORADOR_PLAYWRIGHT pode indicar uma instalação externa do Playwright.
- Android: Java 17, SDK 35, npm ci em web e python build-apk.py. Versão 1.0.80, código 81, pacote br.com.orador.app.

O APK é assinado pelo certificado original. Chave e senha privadas permanecem em signing no projeto local e não integram o ZIP distribuído. Os testes usam dados fictícios, Chromium/WebKit e ponte Android simulada, além das classes Java reais de hash/indexação; não substituem validação em aparelho físico ou conta Google real.
