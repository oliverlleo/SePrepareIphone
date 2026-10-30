# Retomada do Drive no PWA Apple — 20261030.74.1

Foi reproduzida uma falha do validador: POST com Origin exato e Sec-Fetch-Site: same-site retornava 403/request_rejected. O cliente classificava essa recusa como indisponibilidade de rede e repetia a mesma tentativa.

A origem continua sendo verificada integralmente. Origin presente é obrigatório e exato; Origin literal null ou estrangeiro não é aceito. Quando o cabeçalho está ausente, exige-se Referer com a mesma origem HTTPS, além de JSON e do cabeçalho próprio do aplicativo. Metadados same-site somente passam após essa verificação; cross-site continua recusado. Não foi adicionado CORS de terceiros.

O cliente distingue a recusa de uma falha de rede, evitando o ciclo de tentativas automáticas. Cookie, nome, chave, cifragem, cliente Google, segredo, escopo, identidade vinculada e renovação permanecem inalterados. Não se apaga ou migra o caderno.

Reproduzido em requisições de teste locais e no endpoint público sem sessão; não houve acesso ao iPad físico ou à conta Google do usuário. Os casos de cabeçalhos são perfis de compatibilidade simulados e não uma captura de rede do aparelho relatado. A confirmação final no iPad 6/iPadOS 17.7.11 depende de abrir o PWA atualizado e tentar a conexão.
