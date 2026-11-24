# Métricas do SePrepare 1.2.1

## Contrato e destinos

- `sp_caderno_pronto` mede abertura utilizável do Caderno. A sessão de medição tem janela de inatividade de 30 minutos.
- `sp_recurso_usado` registra uma ação observável, como uma comparação realmente exibida ou o início do teleprompter.
- `sp_operacao_iniciada` abre uma tentativa. `sp_operacao_finalizada` registra sucesso, erro ou cancelamento, uma vez por tentativa acompanhada.
- `sp_destino_escolhido` pertence à página Baixar. Registra o botão escolhido quando o visitante permite cookies de estatística.
- `sp_pwa_primeira_abertura` registra a primeira abertura observada do Caderno a partir da Tela de Início, uma vez por armazenamento da PWA com Estatísticas de uso ativas. Uma instalação anterior entra na contagem em sua primeira abertura observada após a atualização.

Os parâmetros dos produtos são `plataforma`, `canal`, `versao_app`, `build_app`, `recurso`, `acao` e, conforme o evento, `resultado`, `motivo`, `tipo`, `modo` ou `formato`. O catálogo aceito está em `analytics.js`; a ponte nativa Android verifica novamente os valores e acrescenta canal e versão do build.

Android direto e Play usam o app Firebase registrado para `br.com.orador.app`. Web/Windows e iPhone/iPad mantêm os fluxos GA4 de seus domínios. A configuração do Android atual coincide com a configuração no ZIP 1.0.93 em identificadores de projeto, app e pacote. A fonte da mudança é 1.2.0. A fonte 1.0.93 é histórica.

## Privacidade e limites de leitura

O GA4 do iPhone/iPad só inicia em `https://ios.seprepareapp.com.br` com Estatísticas de uso ativas. Navegadores que sinalizam automação são excluídos. Para uma conferência manual no domínio público, abra o endereço com `?sp_qa=1`. O bloqueio acompanha a mesma aba enquanto ela estiver aberta. Em testes automatizados, continue interceptando a rede de medição.

O interruptor em **Ajustes → Privacidade → Estatísticas de uso** começa ativo no uso normal do aplicativo público (com opção de desligar a qualquer momento, preservando a escolha gravada). Na distribuição iPhone/iPad, `analytics.js` bloqueia qualquer inicialização fora de `https://ios.seprepareapp.com.br`, em automação (`navigator.webdriver`) e com `?sp_qa=1`. A escolha não é vinculada ao Drive. Os eventos próprios usam valores enumerados e excluem textos, áudios, notas, buscas, códigos, caminhos de arquivos, links privados e identificadores do Caderno.

Enquanto uma PWA está aberta e offline, até 60 eventos válidos podem ficar em memória. São descartados ao fechar a página ou revogar consentimento e escoados uma vez quando ela volta à rede. Um fluxo interrompido pelo encerramento do app pode aparecer apenas como iniciado. Os SDKs também podem adicionar identificador da instalação/navegador, sessão e dados técnicos descritos na política.

O app mede até a confirmação observável. Por exemplo, abrir a apresentação indica uso do modo, gerar o arquivo de calendário indica geração, e iniciar compartilhamento indica que a pessoa chamou esse fluxo. O recebedor gera um evento próprio quando salva uma importação. As contagens representam instalações e perfis observados. A mesma pessoa pode usar mais de uma plataforma.

## Configurar o painel do produto

1. No GA4, confirme em **Fluxos de dados** se Android, Web/Windows e iPhone/iPad já pertencem à mesma propriedade. Os três canais de app continuam com seus destinos existentes. Se estiverem em propriedades diferentes, a concentração em uma propriedade exige o acesso de administrador e uma decisão sobre os fluxos antes de alterar IDs ou vinculações.
2. Crie dimensões personalizadas com escopo **Evento** para `recurso`, `acao`, `resultado`, `motivo`, `plataforma`, `canal`, `versao_app`, `build_app`, `tipo`, `modo` e `formato`. Para o site, use `destino` na propriedade que recebe `sp_destino_escolhido`.
3. Nos fluxos Web/Windows e iPhone/iPad, revise a **Medição otimizada** e desative eventos automáticos de navegação, formulários, buscas e cliques de saída. Os eventos próprios do SePrepare trazem a origem fixa e excluem parâmetros de URL. A configuração do fluxo no GA4 governa a coleta automática da tag.
4. Em **Explorar**, monte um funil fechado de `sp_caderno_pronto` → `sp_operacao_finalizada` (`acao=salvar_preparacao`, `resultado=sucesso`) → `sp_operacao_finalizada` (`acao=ensaiar` ou `treinar`, `resultado=sucesso`). Filtre por canal e versão. A contagem do funil representa instâncias com eventos na ordem escolhida.
5. Monte uma tabela por `recurso` e `acao`. Adoção conta instâncias com uso ou início de operação. Confiabilidade mostra sucessos sobre sucessos e erros finalizados. Mostre cancelamentos e motivos à parte. Inícios sem evento final são especialmente úteis para investigar abandono, fechamento, fila offline ou coleta interrompida. Compare o número de usuários ativos por dia e frequência de retorno quando houver uma janela completa.
6. Nas primeiras versões, confira o DebugView com aparelhos de teste, separando esse tráfego dos relatórios. Uma vez por semana, compare uso e conclusão. Nos primeiros dias após lançar, compare erros de salvamento, gravação e restauração por build.

O download do APK é fornecido por GitHub Releases. Instalação, desinstalação e estabilidade da loja ficam no Play Console. Cloudflare continua com a medição de infraestrutura web.
