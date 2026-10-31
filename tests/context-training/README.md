# Reproduzir os pesos gramaticais

Esta etapa é opcional e separada da compilação do aplicativo. O build comum usa `memorization-tagger-model.json`, já incluído. Python padrão é suficiente para o treinamento.

1. Crie uma pasta de trabalho vazia e copie para ela `download-corpora.py`, `train-tagger.py`, `enrich-tagger.py` e `pos-provenance.json`.
2. Execute `python download-corpora.py`. Os corpora oficiais são baixados para `training/`, com hashes verificados contra a proveniência usada nesta versão. Se o upstream tiver mudado, o script para; não treina silenciosamente com outro corpus.
3. Crie `shared/` e execute `python train-tagger.py`, depois `python enrich-tagger.py`.
4. O resultado fica em `shared/memorization-tagger-model.json`. `tagger-evaluation.json` mede classificação gramatical no dev oficial; não mede a qualidade semântica de cartões.
5. Para alterar os pesos do produto, substitua o arquivo no módulo de memorização, atualize `weights-sha256.txt` e execute as regressões de contexto e os testes com o modelo real antes de compilar.

As amostras de qualidade do SePrepare não participam do treinamento. Os dados e pesos derivados permanecem sob CC BY-SA 4.0; a pasta de licenças contém créditos e licenças dos corpora. Fontes: UniversalDependencies/UD_Portuguese-Bosque, UD_English-EWT, UD_Spanish-GSD, UD_Japanese-GSD.
