# SePrepare 1.0.86 — Ferramentas de cor e revisão

Marca-texto e Cor da letra agora têm acessos e paletas independentes, na barra do editor e em Todas as ferramentas. Com seleção, alteram só o trecho escolhido. Com o cursor, aplicam o estilo à digitação seguinte. Remover uma cor ou o destaque conserva o outro estilo e o restante do documento.

A revisão conserva a posição do cartão visível, o foco e o texto digitado durante a atualização das sugestões. Aplicar uma correção manual mantém a lista aberta. Os índices das sugestões seguintes são ajustados conforme a alteração, preservando a formatação do texto. Respostas pendentes referentes ao texto anterior são descartadas.

Causa reproduzida na 1.0.85: o modal inteiro era recriado ao escolher uma sugestão, levando a rolagem de 7.041 para zero. Agora a atualização se restringe ao conteúdo do mesmo diálogo, com âncoras estáveis por ocorrência.

Validação: 65 verificações específicas de interface e 55 regressões de edição em cinco perfis Chromium/WebKit (Android, Windows, iPad, iPhone e macOS), seis testes de ajuste de índices e as suítes existentes de dados, backup, importação, compartilhamento, memorização e teleprompter. Perfis simulados e dados fictícios; sem aparelho físico ou conta Google pessoal.

Android: versão 1.0.86, código 87, certificado original. Sem alterações de formato do backup, novas dependências ou modelos. Os arquivos Android do site não são modificados por esta entrega. A chave privada permanece fora do ZIP.
