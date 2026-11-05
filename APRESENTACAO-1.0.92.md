# Apresentação 1.0.92

A barra inferior passa a conter Ouvir, Anotações, Tempo e Ritmo. O acesso de Voz foi retirado dessa barra; a configuração continua em Ajustes > Voz e áudio. O Ajustes duplicado foi retirado da barra inferior, preservando o botão do cabeçalho entre Editar e Expandir.

Ao tocar Ouvir, a voz disponível reproduz diretamente. Uma voz ausente abre a configuração. Android consulta o catálogo nativo; Windows atualiza a lista antes de escolher; Apple mantém a tentativa síncrona da voz do sistema mesmo quando o Safari ainda não enumerou as vozes. Somente erros explícitos de voz indisponível abrem a configuração no Apple, sem confundir permissão, rede ou inicialização com ausência de voz.

O rótulo Ritmo tem prioridade quando couber com os outros três controles em uma linha. Não há quantidade fixa de caracteres: a medição usa a fonte, o idioma e o espaço disponível. Em telas largas os demais nomes continuam aparecendo quando couberem. Windows preserva sua coluna lateral.

O Ouvir da gravação continua ao lado de Gravar, com player próprio e Outros áudios. Formatos de dados, backup, compartilhamento, importação e gravações não foram alterados.

Validação: matriz final com 28 perfis (7 tamanhos/plataformas × 4 idiomas), Chromium/WebKit, 140 verificações dos controles e fluxos de voz; regressões de gravação, player, histórico, recuperação e exclusão em 28 perfis; suítes Android, Windows e Apple (688 verificações Apple). Vozes simuladas nos testes; áudio sintético no Chromium e adaptador de mídia no WebKit Windows. Sem aparelho físico ou conta Google real.

Branches separadas, sem mesclar. APK Android e manifesto do site não publicados.
