const rows=[
 ["O motor Hunspell com o dicionário VERO e as regras locais funciona sem internet. A revisão online é opcional e envia por HTTPS o trecho selecionado ao corretor escolhido nos Ajustes. Sem seleção, envia o texto inteiro da preparação, dentro do limite do serviço, quando você solicitar a revisão.","The Hunspell engine with the VERO dictionary and local rules works offline. Online review is optional and sends the selected passage over HTTPS to the service chosen in Settings. With no selection, it sends the entire preparation, within the service limit, when you request a review.","El motor Hunspell con el diccionario VERO y las reglas locales funciona sin conexión. La revisión en línea es opcional y envía por HTTPS el fragmento seleccionado al corrector elegido en Ajustes. Sin selección, envía el texto completo de la preparación, dentro del límite del servicio, cuando solicitas la revisión.","Hunspellエンジン、VERO辞書、ローカルルールはオフラインで動作します。オンライン校正は任意で、選択した範囲を設定で選んだ校正先へHTTPSで送信します。選択範囲がない場合、校正を依頼すると、サービスの上限内で準備内容全体を送信します。"],
 ["A conexão com o Google Drive precisa ser habilitada para a assinatura desta distribuição do SePrepare. Entre em contato com o suporte. Seus dados locais foram preservados.","Google Drive access needs to be enabled for the signing certificate of this SePrepare distribution. Contact support. Your local data has been preserved.","El acceso a Google Drive debe habilitarse para la firma de esta distribución de SePrepare. Ponte en contacto con soporte. Tus datos locales se han conservado.","このSePrepare配布版の署名証明書に対してGoogleドライブへの接続を有効にする必要があります。サポートにお問い合わせください。端末内のデータは保持されています。"],
 ['Atualizações pelo Google Play','Updates through Google Play','Actualizaciones mediante Google Play','Google Playからの更新'],
 ['As atualizações desta versão são disponibilizadas pelo Google Play. Abra a página do SePrepare na loja para conferir se há uma nova versão.','Updates for this version are provided through Google Play. Open the SePrepare store page to check for a new version.','Las actualizaciones de esta versión se distribuyen mediante Google Play. Abre la página de SePrepare en la tienda para comprobar si hay una nueva versión.','このバージョンの更新はGoogle Playから配信されます。ストアのSePrepareページで新しいバージョンをご確認ください。'],
 ['Abrir no Google Play','Open in Google Play','Abrir en Google Play','Google Playで開く'],
 ['Privacidade no aplicativo','Privacy in the app','Privacidad en la aplicación','アプリ内のプライバシー'],
 ['Política completa','Full privacy policy','Política completa','プライバシーポリシー全文'],
 ['Microfone e gravação são opcionais. O áudio fica no aparelho e só é enviado ao seu Drive quando você usa a proteção das gravações.','Microphone access and recording are optional. Audio stays on your device and is only sent to your Drive when you use recording protection.','El micrófono y la grabación son opcionales. El audio permanece en el dispositivo y solo se envía a tu Drive cuando utilizas la protección de grabaciones.','マイクの利用と録音は任意です。音声は端末に保存され、録音の保護機能を使う場合にのみ自分のドライブに送信されます。'],
 ['Ocultar ferramentas','Hide toolbar','Ocultar herramientas','ツールバーを隠す'],
 ['Mostrar ferramentas','Show toolbar','Mostrar herramientas','ツールバーを表示'],
 ['Oculta a barra de ferramentas para escrever na tela toda. Puxe no topo ou toque no botão para voltar.','Hides the toolbar for distraction-free writing. Pull at the top or tap the button to bring it back.','Oculta la barra de herramientas para escribir a pantalla completa. Tira arriba o toca el botón para volver.','ツールバーを隠して全画面で書きます。上部で引き下げるかボタンを押すと戻ります。'],
 ['Como marcar o tempo?','How to mark time?','¿Cómo marcar el tiempo?','時間の記録方法'],
 ['Escolha como o botão Marcar tempo funciona. Depois, segure o botão quando quiser trocar.','Choose how Mark time works. Hold the button later whenever you want to switch.','Elige cómo funciona Marcar tiempo. Mantén presionado el botón cuando quieras cambiar.','「時間を記録」の動作を選びます。後からボタンを長押しすると切り替えられます。'],
 ['Pelo ritmo','By pace','Según el ritmo','ペースに合わせる'],
 ['Calcula automaticamente até esta linha.','Calculates automatically up to this line.','Calcula automáticamente hasta esta línea.','この行まで自動で計算します。'],
 ['Tempo manual','Manual time','Tiempo manual','手動で設定'],
 ['Ignora o ritmo e deixa você escolher minutos e segundos.','Ignores pace and lets you set minutes and seconds.','Ignora el ritmo y te deja elegir minutos y segundos.','ペースを無視して分と秒を自分で設定します。'],
 ['Editar tempo','Edit time','Editar tiempo','時間を編集'],
 ['Minutos','Minutes','Minutos','分'],
 ['Segundos','Seconds','Segundos','秒'],
 ['Usar ritmo','Use pace','Usar ritmo','ペースを使う'],
 ['Estimativa pelo ritmo','Pace estimate','Estimación por ritmo','ペースによる目安'],
 ['Trocar modo','Switch mode','Cambiar modo','モードを変更'],
 ['Segure em Marcar tempo para trocar entre ritmo e manual.','Hold Mark time to switch between pace and manual.','Mantén Marcar tiempo para cambiar entre ritmo y manual.','「時間を記録」を長押しするとペースと手動を切り替えられます。'],
 ['Modo de marcação: Pelo ritmo','Time mark mode: By pace','Modo de marca: Según el ritmo','記録モード: ペースに合わせる'],
 ['Modo de marcação: Tempo manual','Time mark mode: Manual time','Modo de marca: Tiempo manual','記録モード: 手動で設定'],
 ['Editar referência de tempo','Edit time mark','Editar referencia de tiempo','時間の目安を編集'],
 ['Tempo marcado:','Marked time:','Tiempo marcado:','記録した時間:'],
 ['Tempo até esta linha:','Time up to this line:','Tiempo hasta esta línea:','この行までの時間:'],
 ['Tempo previsto:','Expected time:','Tiempo previsto:','予定時間:'],
 ['Remover','Remove','Quitar','削除'],
 ['Informe minutos e segundos válidos.','Enter valid minutes and seconds.','Ingresa minutos y segundos válidos.','正しい分と秒を入力してください。'],
 ['O tempo informado é muito grande.','The entered time is too large.','El tiempo ingresado es demasiado grande.','入力した時間が大きすぎます。'],
 ['Posicione o cursor no texto para marcar o tempo.','Place the cursor in the text to mark time.','Coloca el cursor en el texto para marcar el tiempo.','時間を記録する位置にカーソルを置いてください。'],
 ['A estimativa ultrapassa o limite de tempo da marcação.','The estimate exceeds the time mark limit.','La estimación supera el límite de tiempo de la marca.','目安の時間が記録の上限を超えています。']
];
export const extraCatalogs=Object.fromEntries(['en','es','ja'].map((locale,index)=>[locale,Object.fromEntries(rows.map(row=>[row[0],row[index+1]]))]));

for(const [language,value]of Object.entries({"en":"Optional online review uses LanguageTool. It sends the selected passage or, with no selection, the entire text, within the service limit.","es":"La revisión en línea opcional usa LanguageTool. Envía el fragmento seleccionado o, sin selección, el texto completo, hasta el límite del servicio.","ja":"任意のオンライン校正ではLanguageToolを利用します。選択部分を送信し、選択がない場合はサービスの上限内で全文を送信します。"}))extraCatalogs[language]["A revisão online opcional usa o LanguageTool. Envia o trecho selecionado ou, sem seleção, o texto inteiro, até o limite do serviço."]=value;

extraCatalogs["en"]["O motor Hunspell com o dicionário VERO e as regras locais funciona sem internet. A revisão online opcional usa o LanguageTool. Envia o trecho selecionado ou, sem seleção, o texto inteiro, até o limite do serviço."]="Hunspell, the VERO dictionary and local rules work offline. Optional online review uses LanguageTool. It sends the selected passage or, with no selection, the entire text, within the service limit.";
extraCatalogs["es"]["O motor Hunspell com o dicionário VERO e as regras locais funciona sem internet. A revisão online opcional usa o LanguageTool. Envia o trecho selecionado ou, sem seleção, o texto inteiro, até o limite do serviço."]="Hunspell, el diccionario VERO y las reglas locales funcionan sin conexión. La revisión en línea opcional usa LanguageTool. Envía el fragmento seleccionado o, sin selección, el texto completo, hasta el límite del servicio.";
extraCatalogs["ja"]["O motor Hunspell com o dicionário VERO e as regras locais funciona sem internet. A revisão online opcional usa o LanguageTool. Envia o trecho selecionado ou, sem seleção, o texto inteiro, até o limite do serviço."]="Hunspell、VERO辞書、ローカルルールはオフラインで動作します。任意のオンライン校正ではLanguageToolを利用します。選択部分を送信し、選択がない場合はサービスの上限内で全文を送信します。";
