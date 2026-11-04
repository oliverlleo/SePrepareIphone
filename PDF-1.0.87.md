# SePrepare 1.0.87 — Exportar PDF

A opção Exportar PDF fica imediatamente abaixo de Compartilhar discurso/demonstração, tanto no Caderno quanto no Editor. Também está disponível no menu Exportar, junto dos três formatos existentes.

A mesma janela mostra ajustes e a prévia real do PDF. Inclui folha A4, título e subtítulo, fontes incorporadas, texto selecionável, estilos, quebras explícitas, participantes e falas. O logotipo original aparece no canto inferior direito e a numeração acompanha todas as páginas. O documento permanece claro para leitura/impressão mesmo usando o tema escuro do aplicativo.

O tamanho da letra é ajustável. Ritmos e marcações de tempo são opcionais. Anotações privadas ficam desmarcadas e só entram em uma seção própria com autorização explícita. Outras versões e históricos de estudo não são exportados. O gerador trabalha em um worker local; somente a página atual é renderizada na prévia. Abrir, ajustar, gerar e fechar não criam versões ou alteram o backup.

Android grava os bytes do PDF pelo seletor de arquivos do sistema. Apple/PWA usa compartilhamento de arquivo quando disponível, com download de reserva. Windows usa download. O PWA mantém os recursos locais necessários ao uso offline após instalar/atualizar.

Validação: 18 testes de estrutura e privacidade; 48 verificações de interface em cinco perfis Chromium/WebKit; 2 verificações offline; 18 PDFs conferidos com extração de texto e renderização, fontes, rodapés e margens; 120 regressões de edição/revisão; suítes existentes de dados, backup, compartilhamento, importação, memorização e teleprompter. Foram utilizados dados fictícios e perfis simulados, sem dispositivo físico ou conta Google pessoal.

Bibliotecas: pdfmake 0.3.13 (MIT) e PDF.js 6.5.438 (Apache-2.0). Fontes Roboto e Lora sob SIL OFL. Licenças acompanham os recursos em pdf/licenses/. Não há serviço remoto de PDF ou upload do documento.

Android 1.0.87, código 88, certificado original. APK e manifesto Android do site permanecem fora desta publicação. ZIP sem chave privada.
