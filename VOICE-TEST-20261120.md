# Teste de voz — 20/11/2026

Corrigida a retomada de uma fila de síntese pausada antes da leitura/teste/ensaio. `cancel()` conserva o estado pausado do navegador; agora `resume()` precede `speak()` quando necessário, mantendo a primeira chamada no gesto do usuário.

O botão mostra **Iniciando teste…** até o evento de início, e só então **Parar teste**. Falha, indisponibilidade, tempo limite e parada restauram o teste. Preservadas as alternativas de voz Apple, os idiomas, a posição de leitura e o host compilado protegido.

Teste e ajuda ficam alinhados em uma coluna, separados por 12 px. No iPhone/iPad, **Como adicionar vozes** mostra uma orientação recolhível para os Ajustes; não promete instalar vozes pela PWA. Windows mantém sua ação existente. Textos em português, inglês, espanhol e japonês.

Validação: regressões simuladas de fila pausada, início/erro/tempo limite/exceção/repetição, texto/velocidade sem salvar e ajuda acessível; suíte completa, contrato do host e idempotência. Interface em WebKit: 24 combinações de tamanho/idioma, de 320 px ao iPad, paisagem e texto ampliado. Sem sobreposição; capturas examinadas. Shell/cache `20261120.2`.

**Limite:** síntese e seus eventos simulados nos testes. Som audível, rota de áudio e vozes instaladas ainda exigem reteste em iPhone físico. Nenhum dado pessoal ou conta foi usado. Não limpar o armazenamento para atualizar.

Referências: [estado de pausa na especificação Web Speech](https://webaudio.github.io/web-speech-api/), [Ajustes de voz Apple](https://support.apple.com/pt-br/guide/iphone/iph96b214f0/ios).
