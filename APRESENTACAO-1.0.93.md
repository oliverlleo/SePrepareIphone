# Apresentação 1.0.93

Nomes consistentes em Android, Apple e Windows/Web: **Leitura** (voz do sistema), **Reproduzir** (áudio gravado) e **Nota** (atalho de anotações). Inglês: Reading / Play / Note; espanhol: Lectura / Reproducir / Nota; japonês: 読み上げ / 再生 / メモ. A tradução da leitura por voz é específica desse botão, sem alterar o sentido das outras opções de leitura.

O layout prioriza o celular. Reproduzir mantém ícone e texto. Quando há gravação acessível, o cronômetro usa uma legenda curta e a largura restante da primeira faixa. A medição considera os nomes reais e o botão Encerrar durante o ensaio; em espaço restrito, controles secundários passam a ícones com descrição acessível, sem quebrar nomes ou sobrepor botões. Nota e Ritmo aproveitam a largura da segunda faixa. Telas maiores preservam suas adaptações, incluindo a coluna lateral do Windows.

A faixa Posição da leitura aparece durante a reprodução por voz e desaparece ao pausar. Continuar conserva a posição e restaura a faixa. O player da gravação é independente e continua oferecendo a linha do tempo quando está pausado.

Verificação: fluxos completos em Chromium e WebKit nos quatro idiomas, incluindo gravação real com áudio sintético no Chromium, adaptador de mídia no WebKit para Windows, rótulos e geometria dos botões, cronômetro iniciado/pausado, pausa da leitura, playback e histórico. Suítes existentes Android, Windows e Apple, com build Apple idempotente. Sem aparelho físico ou conta Google real. Não houve mudança nos formatos de texto, backup, importação, compartilhamento ou áudios.

Branches separadas, sem mesclar. APK e manifesto do site preservados.
