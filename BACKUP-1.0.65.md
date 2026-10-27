# SePrepare 1.0.65 — intervalo entre backups e avisos

## Correção

A versão anterior impunha dez segundos entre cada requisição ao Drive. Isso foi removido do cliente nativo Android e dos controladores Windows/Web e Apple. As filas continuam serializando acesso e verificando conta/autorização, sem dormir entre consulta, download, upload, confirmação ou limpeza do mesmo backup.

O limite de dez segundos agora usa o horário local em que um upload foi confirmado. Esse horário é persistido e vale para o próximo envio manual ou automático. Não existe a espera inicial obrigatória de dez segundos após a primeira edição quando nenhum backup anterior exige intervalo. Tentativas automáticas sem sucesso continuam agrupadas e falhas transitórias mantêm o backoff; essas políticas não pausam os HTTPs internos de uma operação.

Um pedido manual durante o intervalo aguarda a janela e reconfere os dados e a cópia remota. Se o usuário editar enquanto espera, a autorização do snapshot antigo é recusada; se surgir outra cópia no Drive, uma nova conferência é apresentada. Consultar a lista, restaurar ou reconhecer conteúdo idêntico não espera a janela de um novo upload.

As descrições de recuperação foram corrigidas no modal e os textos do intervalo foram corrigidos na ajuda, nas três plataformas e nos idiomas português, inglês, espanhol e japonês. Usar Drive reproduz a cópia selecionada; manter o aparelho não importa dados; ambos preserva as diferenças. O texto antigo que dizia que usar Drive conservaria itens locais foi retirado da opção.

## Verificação

- Sete novos cenários de tempo em Windows/Web e Apple: operação sem pausa HTTP; upload que demora 25 segundos seguido de novo envio; manual; conteúdo idêntico; edição durante espera; cópia concorrente durante espera; reabertura.
- Seis cenários de descrição e comportamento nas três plataformas, verificando os textos traduzidos e executando as três escolhas reais de recuperação.
- Java real, com HttpURLConnection e servidor de teste local: 20 verificações do cliente e da política de tempo. Quatro requisições passaram pela fila sem pausas artificiais. O verificador usa o mesmo caminho de transporte da produção, sem um parâmetro especial para desativar a espera apenas em testes.
- Controlador Android real com interfaces Android/Google simuladas: 80 verificações, incluindo confirmação durável e janela manual.
- Android: 279 verificações existentes e 37 regressões incrementais da 1.0.64, mais os seis cenários de escolhas.
- Windows: build completo e `npm test`, incluindo persistência, autorização simulada, fila, falhas, retenção, recursos offline, editor, ritmos e novos cenários.
- Apple: agregador com 335 verificações, contrato das funções protegidas preservado e build idempotente. Autenticação, memória, gate e adaptações Apple conservadas.
- Compilação oficial Android de release, versão 1.0.65 e código 66; certificado original conferido, com pacote `br.com.orador.app` e sem modo de depuração. Conferência de recursos finais e modelo local no relatório do APK.

Os cenários de tempo web usam relógio controlado e HTTP simulado; os de transporte Java usam um servidor local. Não representam medição de velocidade da internet ou Google Drive real. Não houve nova validação visual nem instalação em aparelho físico. Nenhuma ação reiniciou ou encerrou o computador ou programas do usuário.

## Entrega

APK assinado, ZIP de fontes Android sem chave/senha, fontes dos dois PWAs, JSON com hash real do APK e descrição em texto simples abaixo de 2.000 caracteres. A release Android fica preparada para `v1.0.65`; o APK deve ser publicado nesse endereço antes de ativar o manifesto remoto. Não houve alteração do manifesto Android remoto.
