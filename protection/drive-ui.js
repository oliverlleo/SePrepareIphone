import {t as translateUI,tr as formatUI,h as markupUI,html as htmlUI,uiLocale,setLanguage,normalizeLanguage,systemMessage} from './i18n.js';
import {mergeDriveBackup,inspectDriveBackup,driveHash,driveIndex,planDriveRestore} from './drive-core.js';
import {backupDocumentHash} from './drive-backup-state.js';
import {contentDifferences,documentKey} from './drive-compare.js';
export function createDriveUI(c){
 const {native,rt,$,icon,btn,esc,openModal,closeModal,toast}=c;
 let info={connected:false,autoBackup:true,autoRead:true,busy:false},files=[],pending=null,preview=null,merging=false,inflight=false,lastRequest='',activeAction='',connectionNotice='',shownPending='',foregroundVisible=!document.hidden,checkOnIdle=false,planning=false,cardGeneration=0;
 const supported=()=>!!native?.driveStatus&&!!native?.driveAction;
 const stamp=value=>value?new Date(Number(value)).toLocaleString(uiLocale(),{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):translateUI('Sem data registrada');
 const confirmedAt=()=>Number(info.lastConfirmedAt)||Number(info.lastBackupAt)||0;
 const pendingKey=p=>p?(p.account||info.email)+':'+p.id+':'+(p.sourceHash||p.at||''):'';
 const eligible=p=>!!p&&info.connected&&(!p.account||p.account===info.email)&&(info.autoRead||p.reason==='before-backup');
 function update(){if(supported())try{info={...info,...JSON.parse(native.driveStatus())};}catch{}info.busy=info.busy||inflight;return info;}
 function connectionState(){
  if(!supported())return {tone:'neutral',symbol:'Cloud',title:translateUI('Conexão com o Google Drive'),detail:''};
  if(info.readOnly)return {tone:'neutral',symbol:'Cloud',title:translateUI('Este caderno está aberto em outra aba'),detail:translateUI('Use a aba que pode salvar para alterar o backup.')};
  if(info.busy)return {tone:'pending',symbol:'Clock',title:({connect:translateUI('Conectando ao Google Drive…'),check:translateUI('Verificando o Google Drive…'),'prepare-backup':translateUI('Conferindo o backup existente…'),'backup-confirm':translateUI('Salvando backup no Drive…'),restore:translateUI('Lendo backup do Drive…'),list:translateUI('Buscando seus backups…'),disconnect:translateUI('Desconectando conta…')})[activeAction]||translateUI('Atualizando Google Drive…'),detail:translateUI('Você pode continuar usando o aplicativo.')};
  if(info.authorizationLoading)return {tone:'pending',symbol:'Clock',title:translateUI('Preparando conexão com o Google Drive…'),detail:translateUI('Você pode continuar usando o aplicativo.')};
  if(info.connected&&info.reconnectSetupRequired)return {tone:'pending',symbol:'Cloud',title:translateUI('Autorize a reconexão automática'),detail:translateUI('Uma autorização permite retomar o Drive ao abrir o aplicativo.')};
  if(info.managedAuthorization&&info.needsAuthorization&&!info.needsReconnect)return {tone:'pending',symbol:'Clock',title:translateUI('Retomando o Google Drive automaticamente…'),detail:translateUI('Se o acesso estiver indisponível, o aplicativo tentará novamente.')};
  if(info.authorizationPending)return {tone:'pending',symbol:'Clock',title:translateUI('Verificando acesso ao Google Drive…'),detail:translateUI('A conta já está vinculada. O SePrepare está tentando retomar a autorização.')};
  if(info.needsAuthorization&&!info.needsReconnect)return {tone:'pending',symbol:'Cloud',title:translateUI('Conta Google vinculada · backup aguardando autorização'),detail:translateUI('Os backups do Drive estão pausados até a autorização ser renovada. O SePrepare tentará reutilizar sua conta na próxima interação.')};
  if(info.needsReconnect)return {tone:'warning',symbol:'AlertCircle',title:translateUI('Reconexão necessária'),detail:systemMessage(info.error)||translateUI('Abra o backup e autorize sua conta novamente.')};
  if(connectionNotice||info.errorCode==='cancelled')return {tone:'neutral',symbol:info.connected?'Info':'CloudOff',title:info.connected?(info.errorCode==='cancelled'?translateUI('Conexão cancelada.'):translateUI('Conectado ao Google Drive')):translateUI('Não conectado'),detail:connectionNotice||info.error||translateUI('Conexão cancelada.')};
  if(info.error&&!(info.connected&&info.errorCode==='network'))return {tone:'warning',symbol:'AlertCircle',title:info.connected?translateUI('Conta conectada · verifique o backup'):translateUI('Conexão não concluída'),detail:systemMessage(info.error)};
  if(info.connected&&info.email){
   if(info.needsReview)return pending?.requiresDecision?{tone:'pending',symbol:'Info',title:translateUI('Há diferenças para conferir'),detail:translateUI('Confira as versões antes do próximo envio.')}:{tone:'pending',symbol:'Clock',title:translateUI('Conferindo o backup existente…'),detail:translateUI('Você pode continuar usando o aplicativo.')};
   if(!info.autoBackup)return {tone:'neutral',symbol:'Cloud',title:translateUI('Backup automático desligado'),detail:translateUI('As próximas alterações aguardam um envio manual.')};
   if(info.backupPending)return {tone:'pending',symbol:'CloudUpload',title:translateUI('Alterações aguardando backup'),detail:info.backupRetryAt?translateUI('O aplicativo tentará salvar novamente.'):translateUI('Sua próxima cópia será salva quando o Drive estiver disponível.')};
   if(!confirmedAt()&&!c.getState().speeches.length)return {tone:'neutral',symbol:'Cloud',title:translateUI('Pronto para proteger seus discursos'),detail:translateUI('Suas próximas preparações terão backup automático.')};
   return {tone:confirmedAt()?'connected':'pending',symbol:confirmedAt()?'CloudCheck':'CloudUpload',title:confirmedAt()?translateUI('Backup atualizado'):translateUI('Preparando sua primeira cópia'),detail:''};
  }
  return {tone:'neutral',symbol:'CloudOff',title:translateUI('Não conectado'),detail:translateUI('Conecte sua conta para guardar backups.')};
 }
 function summary(){const s=connectionState(),busy=info.busy||info.readOnly||info.authorizationLoading?'disabled':'';return markupUI`<div class="drive-connection drive-connection-${s.tone}" role="status" aria-live="polite" aria-atomic="true"><span class="drive-connection-symbol">${icon(s.symbol)}</span><div><strong>${esc(s.title)}</strong><span class="drive-connection-email">${info.connected&&info.email?esc(info.email):translateUI('Google Drive')}</span>${s.detail?markupUI`<small>${esc(s.detail)}</small>`:''}</div></div>${info.connected?markupUI`<div class="drive-last-copy"><span>Última cópia concluída</span><strong>${confirmedAt()?stamp(confirmedAt()):translateUI('Ainda não realizada neste aparelho')}</strong></div>`:''}<div class="drive-entry-actions">${!info.connected||info.reconnectSetupRequired||info.needsReconnect||info.needsAuthorization&&!info.authorizationPending&&!info.managedAuthorization?btn('drive-connect',info.connected&&info.reconnectSetupRequired?translateUI('Autorizar reconexão automática'):info.needsReconnect?translateUI('Autorizar acesso aos backups'):translateUI('Conectar Google Drive'),'Cloud','full',supported()?busy:'disabled'):''}${info.needsReview&&pending?.requiresDecision?btn('drive-review-pending',translateUI('Conferir versões diferentes'),'Copy','secondary full',busy):''}${btn('drive-settings',translateUI('Opções avançadas'),'SlidersHorizontal','secondary full')}</div>`;}
 function refreshEntry(readNative=false){if(readNative)update();const target=$('#driveConnectionStatus');if(target)target.innerHTML=summary();void refreshCards();}
 function settingsEntry(){update();return markupUI`<div class="drive-settings-entry" id="driveConnectionStatus">${summary()}</div>`;}
 function mark(kind){rt.modal=kind;$('.modal')?.classList.add('drive-screen');$('.modal-backdrop')?.classList.add('drive-screen-backdrop');}
 function cardIndicator(s){return markupUI`<span class="drive-card-status drive-card-status-pending" data-drive-document="${esc(s.id)}" role="img" aria-label="${translateUI('Conferindo a cópia deste conteúdo')}" title="${translateUI('Conferindo a cópia deste conteúdo')}">${icon('Cloud')}</span>`;}
 const cardHashes=new Map();
 async function refreshCards(){
  const generation=++cardGeneration,nodes=[...document.querySelectorAll('[data-drive-document]')];if(!nodes.length)return;
  const account=info.email;let saved={};try{saved=JSON.parse(native?.driveBackupIndex?.()||'{}');}catch{}
  const state=JSON.parse(JSON.stringify(c.getState())),documents=new Map(state.speeches.map(doc=>[doc.id,doc])),lookup={categories:new Map(state.categories.map(category=>[category.id,category])),drafts:new Map((state.editorDrafts||[]).map(draft=>[draft.speechId,draft]))};
  await Promise.all(nodes.map(async node=>{
   const doc=documents.get(node.dataset.driveDocument);if(!doc)return;
   let tone='pending',symbol='CloudUpload',label=translateUI('Alterações ainda não salvas no Drive');
   if(!supported()||!info.connected){tone='neutral';symbol='CloudOff';label=translateUI('Google Drive não conectado');}
   else if(info.needsReconnect){tone='warning';symbol='CloudAlert';label=translateUI('Autorize o acesso para atualizar esta cópia');}
   else if(saved.account===account&&saved.documents?.[doc.id]){try{const draft=lookup.drafts.get(doc.id),key=JSON.stringify([doc,lookup.categories.get(doc.categoryId),draft,draft&&lookup.categories.get(draft.document?.categoryId)]),cached=cardHashes.get(doc.id);const hash=cached?.key===key?cached.hash:await backupDocumentHash(doc,state,lookup);cardHashes.set(doc.id,{key,hash});if(saved.documents[doc.id]===hash){tone='saved';symbol='CloudCheck';label=translateUI('Esta versão está salva no Google Drive');}}catch{label=translateUI('Não foi possível conferir a cópia deste conteúdo');}}
   if(tone==='pending'&&info.backupError){tone='warning';symbol='CloudAlert';label=translateUI('O envio desta alteração está pendente. Veja Backup e recuperação nos Ajustes.');}
   if(generation!==cardGeneration||account!==info.email||!node.isConnected)return;
   node.className='drive-card-status drive-card-status-'+tone;node.innerHTML=icon(symbol);node.setAttribute('aria-label',label);node.title=label;
  }));
 }
 function benefits(){return markupUI`<div class="drive-benefits">${[translateUI('Cópias na sua conta Google'),translateUI('Continue usando sem internet'),translateUI('Recupere em outro aparelho')].map(text=>markupUI`<p>${icon('CheckCircle2')}<span>${text}</span></p>`).join('')}</div>`;}
 function offer(){if(!supported()||!c.readable()||rt.view!=='home'||$('.modal-backdrop')||!native.driveTakeOffer?.())return;openModal(translateUI('Proteja suas preparações'),markupUI`<div class="drive-intro"><span class="drive-emblem">${icon('Cloud')}</span><p>Conecte seu Google Drive para guardar cópias dos seus discursos, partes e versões e recuperar tudo em outro aparelho.</p></div>${benefits()}<p class="notice">Você pode configurar isso depois nos Ajustes.</p>`,btn('drive-connect',translateUI('Conectar Google Drive'),'Cloud','full')+btn('drive-dismiss',translateUI('Agora não'),'','link full'));$('.modal')?.classList.add('drive-offer-sheet');mark('drive-offer');}
 function settings(){
  update();const busy=info.busy||info.readOnly||info.authorizationLoading?'disabled':'',connected=info.connected,s=connectionState();
  const header=markupUI`<div class="drive-account"><span class="drive-emblem">${icon('Cloud')}</span><div><strong>${connected?esc(info.email):translateUI('Google Drive')}</strong><small>${esc(s.title)}</small></div><span class="drive-state drive-state-${s.tone}">${icon(s.symbol)}</span></div>`;
  const error=info.error||connectionNotice?markupUI`<p class="drive-feedback" role="status">${icon('Info')}<span>${esc(systemMessage(info.error||connectionNotice))}</span></p>`:'';
  const prefs=connected?markupUI`${info.reconnectSetupRequired||info.needsReconnect||info.needsAuthorization&&!info.authorizationPending&&!info.managedAuthorization?btn('drive-connect',info.reconnectSetupRequired?translateUI('Autorizar reconexão automática'):translateUI('Autorizar acesso aos backups'),'Cloud','full',busy):''}<div class="drive-section-heading">Proteção automática</div><div class="drive-preferences"><label class="drive-toggle"><span><strong>Backup automático</strong><small>Salva quando o conteúdo muda de verdade.</small></span><input id="driveAutoBackup" type="checkbox" role="switch" ${info.autoBackup?'checked':''} ${busy}></label><label class="drive-toggle"><span><strong>Recuperação automática</strong><small>Ao abrir o app, recupera novidades do Drive. Versões diferentes pedem sua escolha.</small></span><input id="driveAutoRead" type="checkbox" role="switch" ${info.autoRead?'checked':''} ${busy}></label></div><details class="drive-details"><summary>Como a proteção funciona</summary><p>Alterações próximas são reunidas em uma cópia, com pelo menos 10 segundos entre requisições ao Drive. Sem internet, o envio aguarda e tenta novamente. O navegador precisa permanecer aberto. Abas em segundo plano podem adiar os envios.</p><p>A recuperação consulta ao abrir ou voltar ao aplicativo, com pelo menos 15 minutos entre tentativas. Seus textos diferentes podem ser preservados como versões no mesmo item.</p></details>${pending?.requiresDecision?markupUI`<div class="drive-feedback">${icon('Info')}<span>Há versões diferentes aguardando sua escolha.</span></div>${btn('drive-review-pending',translateUI('Conferir versões diferentes'),'Copy','secondary full',busy)}`:''}<div class="drive-section-heading">Cópias no Google Drive</div><div class="drive-main-actions">${btn('drive-backup',translateUI('Salvar uma cópia agora'),'CloudUpload','full',busy)}${btn('drive-list',translateUI('Recuperar meus discursos'),'History','secondary full',busy)}</div><details class="drive-details drive-operation-details"><summary>Detalhes das operações</summary><div class="drive-times"><p><span>Último envio deste aparelho</span><strong>${info.lastBackupAt?stamp(info.lastBackupAt):translateUI('Ainda não realizada neste aparelho')}</strong></p><p><span>Última tentativa de envio</span><strong>${info.lastBackupAttemptAt?stamp(info.lastBackupAttemptAt):translateUI('Nenhuma registrada')}</strong></p><p><span>Última verificação no Drive</span><strong>${info.lastCheckedAt?stamp(info.lastCheckedAt):translateUI('Ainda não realizada')}</strong></p><p><span>Último backup conferido</span><strong>${info.lastReadAt?stamp(info.lastReadAt):translateUI('Ainda não conferido')}</strong></p><p><span>Última recuperação aplicada</span><strong>${info.lastRestoredAt?stamp(info.lastRestoredAt):translateUI('Nenhuma registrada')}</strong></p></div>${info.backupCleanupPending?markupUI`<p class="drive-feedback">${icon('Info')}<span>Seu backup está salvo. A limpeza de algumas cópias anteriores será tentada novamente.</span></p>`:''}</details>`:markupUI`<p class="help">Conecte sua conta para salvar e recuperar seus discursos automaticamente.</p>${benefits()}${btn('drive-connect',translateUI('Conectar Google Drive'),'Cloud','full',supported()?busy:'disabled')}${!supported()?htmlUI('<p class="notice">A conexão com o Drive não está disponível agora.</p>'):''}`;
  openModal(translateUI('Opções de backup'),markupUI`<div class="drive-panel">${header}${error}${prefs}<div class="drive-section-heading">Backup em arquivo</div><div class="drive-file-actions">${btn('backup',translateUI('Exportar backup'),'Download','secondary full')}${btn('import',translateUI('Importar arquivo'),'FileUp','secondary full')}</div>${connected?markupUI`<div class="drive-account-actions">${btn('drive-disconnect-confirm',translateUI('Desconectar conta'),'CloudOff','link full',busy)}</div>`:''}<p class="drive-private">${icon('ShieldCheck')}O conteúdo fica na área privada do SePrepare na sua conta Google.</p></div>`,btn('close-modal',translateUI('Concluir'),'Check'));mark('drive-settings');
  $('#driveAutoBackup')?.addEventListener('change',e=>request(e.target.checked?'prepare-backup':'auto-backup',e.target.checked?JSON.stringify({enable:true}):'false'));
  $('#driveAutoRead')?.addEventListener('change',e=>request('auto-read',String(e.target.checked)));
 }
 function request(kind,argument=''){
  if(inflight||info.busy){if(kind!=='check')toast(translateUI('Aguarde a operação atual.'));return false;}
  if(!supported()){toast(translateUI('A conexão com o Drive não está disponível agora.'));return false;}
  if(!c.readable()){toast(translateUI('Recupere os dados locais antes de usar o backup do Drive.'));return false;}
  if(kind==='prepare-backup'&&!c.persist(true))return false;
  if(kind==='check')checkOnIdle=false;
  info.busy=true;inflight=true;activeAction=kind;connectionNotice='';lastRequest='drive-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  try{native.driveAction(kind,lastRequest,argument);}catch{inflight=false;info.busy=false;connectionNotice=translateUI('Não foi possível iniciar a conexão. Tente novamente.');toast(connectionNotice);}refreshEntry();
  if(['list','restore'].includes(kind)){openModal(translateUI('Recuperar meus discursos'),markupUI`<div class="drive-loading" role="status">${icon('CloudDownload')}<strong>${kind==='list'?translateUI('Buscando suas cópias…'):translateUI('Conferindo esta cópia…')}</strong><p>Seus dados continuam salvos neste aparelho.</p></div>`,btn('drive-settings',translateUI('Voltar'),'ArrowLeft','secondary'));mark('drive-loading');}
  else if(kind!=='check'&&rt.modal?.startsWith('drive-'))settings();return true;
 }
 const fileTime=file=>Number(file.appProperties?.at)||Date.parse(file.createdTime)||0;
 function list(){
  const ordered=files.slice().sort((a,b)=>fileTime(b)-fileTime(a)),latest=ordered[0];
  const row=(file,recommended=false)=>markupUI`<button type="button" class="drive-backup-copy ${recommended?'drive-backup-copy-latest':''}" data-action="drive-preview" data-id="${esc(file.id)}"><span class="drive-copy-icon">${icon(recommended?'CloudCheck':'History')}</span><span class="drive-copy-content">${recommended?htmlUI('<span class="drive-recommended">Mais recente · recomendada</span>'):''}<strong>${stamp(fileTime(file))}</strong><small>${formatUI`${Number(file.appProperties?.items)||0} discursos e partes`}</small></span>${icon('ChevronRight')}</button>`;
  openModal(translateUI('Recuperar meus discursos'),markupUI`<div class="drive-recovery"><p class="help">Escolha uma cópia para conferir antes de recuperar.</p>${latest?markupUI`${row(latest,true)}${ordered.length>1?markupUI`<details class="drive-details drive-copy-history"><summary>Ver outras cópias</summary><div class="drive-copy-list">${ordered.slice(1,30).map(file=>row(file)).join('')}</div></details>`:''}<p class="drive-private">${icon('ShieldCheck')}Textos diferentes podem ser preservados como versões.</p>`:htmlUI('<div class="empty"><h3>Nenhuma cópia encontrada</h3><p>Quando seu primeiro backup for concluído, ele aparecerá aqui.</p></div>')}</div>`,btn('drive-settings',translateUI('Voltar'),'ArrowLeft','secondary'));mark('drive-list');
 }
 function differences(report){return report.conflicts.length?markupUI`<div class="drive-differences">${report.conflicts.map(row=>markupUI`<div class="drive-difference"><strong>${esc(row.title||translateUI('Sem título'))}${row.kind==='category'?htmlUI('<small>Categoria</small>'):''}</strong><span class="drive-newer">${({local:translateUI('Aparelho com data mais recente'),cloud:translateUI('Drive com data mais recente'),unknown:translateUI('Confira as duas cópias')})[row.newer]}</span>${row.fields?.length?markupUI`<p class="drive-changed-fields">${row.fields.map(field=>esc(translateUI(field))).join(' · ')}</p>`:''}${row.fields?.includes('Texto')?markupUI`<details class="drive-text-comparison"><summary>Comparar o texto</summary><strong>Neste aparelho</strong><p>${esc(row.localPreview)}</p><strong>No Google Drive</strong><p>${esc(row.cloudPreview)}</p></details>`:''}${row.activeDifference?markupUI`<p class="notice">Versão no aparelho: ${esc(row.localVersion||translateUI('Original'))} · No Drive: ${esc(row.cloudVersion||translateUI('Original'))}</p>`:''}${row.kind==='speech'?markupUI`<div><span>Aparelho: ${stamp(row.localAt)}</span><span>Drive: ${stamp(row.cloudAt)}</span></div>`:''}</div>`).join('')}</div><p class="notice">As datas ajudam a comparar; o app não escolhe por você.</p>`:'';}
 function choices(){
  const choice=(value,symbol,title,detail)=>markupUI`<label class="drive-choice"><input type="radio" name="drivePolicy" value="${value}" ${value==='both'?'checked':''}>${icon(symbol)}<span><strong>${title}</strong><small>${detail}</small></span></label>`;
  return markupUI`<fieldset class="drive-choices"><legend>Como deseja preservar seus conteúdos?</legend>${choice('both','Copy',translateUI('Manter as duas versões'),translateUI('Recomendado. Nenhum dos dois textos será descartado.'))}<p class="drive-choice-consequence">Os textos diferentes ficam como versões no mesmo item. Os dados gerais e a versão ativa deste aparelho são mantidos.</p><details class="drive-details drive-other-choices"><summary>Outras escolhas</summary>${choice('local','Smartphone',translateUI('Continuar com os dados deste aparelho'),translateUI('Não importa os dados desta cópia do Drive. Se confirmar um envio, os dados atuais serão a cópia mais recente.'))}${choice('cloud','CloudDownload',translateUI('Usar os dados do Google Drive'),translateUI('Usa os dados gerais e a versão ativa do Drive. Textos diferentes deste aparelho ficam como versões; itens exclusivos são preservados.'))}</details></fieldset>`;
 }
 async function showDecision(payload,mode='read',prepared=null){
  if(payload.account&&payload.account!==info.email)return;
  try{
   const modal=rt.modal,plan=payload.state?(prepared?.report?prepared:await planDriveRestore(c.getState(),payload.state,await baseline())):null;
   if(payload.account&&payload.account!==info.email||rt.modal!==modal)return;
   if(plan&&mode==='restore'&&!payload.automatic){const conflicts=[];for(const remote of plan.report.incoming.speeches){const local=c.getState().speeches.find(item=>item.id===remote.id);if(local&&documentKey(local)!==documentKey(remote))conflicts.push({kind:'speech',id:remote.id,title:local.title||remote.title,newer:'unknown',localAt:local.updatedAt||0,cloudAt:remote.updatedAt||0,...contentDifferences(local,remote)});}plan.report={...plan.report,conflicts:[...conflicts,...plan.report.conflicts.filter(row=>row.kind==='category')]};if(plan.report.conflicts.length)plan.result=null;}
   const report=plan?.report||null,backup=mode==='backup',beforeBackup=payload.reason==='before-backup',empty=!c.getState().speeches.length;
   preview={...payload,mode,plan};if(payload.automatic){shownPending=pendingKey(payload);if(pending&&pending.id===payload.id)pending.requiresDecision=!!(report?.conflicts.length||!info.autoRead&&plan?.result?.changed);}
   if(backup&&!payload.id&&!empty){void applyChoice('both');return;}
   if(plan&&!plan.report.conflicts.length&&!empty&&((!plan.result?.changed&&!backup)||(backup&&(info.autoRead||!plan.result?.changed)))){void applyChoice('both',!!payload.automatic,preview,plan);return;}
   const title=backup?(payload.id?translateUI('Confira antes de salvar'):translateUI('Guardar seu primeiro backup?')):beforeBackup?translateUI('Confira antes do próximo envio'):report.conflicts.length?translateUI('Encontramos versões diferentes'):translateUI('Recuperar discursos');
   const intro=report?.conflicts.length===1?formatUI`“${report.conflicts[0].title||translateUI('Sem título')}” tem diferenças entre este aparelho e a cópia do Google Drive.`:backup?(payload.id?translateUI('Há uma cópia nesta conta. Confira os conteúdos antes de salvar uma nova.'):translateUI('O backup ficará na sua conta Google.')):beforeBackup?translateUI('Encontramos uma cópia de outro aparelho. Confira antes de continuar os envios automáticos.'):report.conflicts.length?translateUI('Existem conteúdos diferentes entre este aparelho e a cópia do Google Drive.'):translateUI('Encontramos uma cópia dos seus discursos no Google Drive.');
   const counts=report?markupUI`<div class="drive-comparison"><div>${icon('Smartphone')}<strong>${report.localItems}</strong><span>No aparelho</span></div><div>${icon('Cloud')}<strong>${report.remoteItems}</strong><span>No Drive</span></div></div>${report.added?markupUI`<p class="notice">${report.added===1?translateUI('1 preparação do Drive ainda não está neste aparelho.'):formatUI`${report.added} preparações do Drive ainda não estão neste aparelho.`}</p>`:''}`:'';
   const emptyChoice=empty&&backup?markupUI`<div class="drive-feedback">${icon('Info')}<span>${payload.enable?translateUI('Um caderno vazio não será enviado automaticamente. Você pode recuperar a cópia existente ou ativar a proteção para suas próximas preparações.'):payload.id?translateUI('Este aparelho está vazio. Mantenha as duas versões para recuperar os dados do Drive antes do envio.'):translateUI('Este aparelho está vazio. Uma cópia vazia só será criada se você autorizar abaixo.')}</span></div>`:'';
   openModal(title,markupUI`<div class="drive-review"><p class="help">${esc(intro)}</p>${report?.conflicts.length?markupUI`<p class="drive-change-summary">${[...new Set(report.conflicts.flatMap(row=>row.fields||[]))].map(field=>esc(translateUI(field))).join(" · ")}</p>`:""}${payload.at?markupUI`<p class="drive-copy-date">${icon('History')}${stamp(payload.at)}</p>`:''}${emptyChoice}${report&&(report.conflicts.length||backup&&empty&&payload.id)?choices():''}${report?.conflicts.length?markupUI`<details class="drive-details drive-conflict-details"><summary>Ver os detalhes das diferenças</summary>${counts}${differences(report)}</details>`:markupUI`${counts}<div class="drive-feedback">${icon('ShieldCheck')}<span>Seus dados atuais serão preservados. Textos diferentes poderão ser mantidos como versões.</span></div>`}${empty&&backup&&!payload.enable?htmlUI('<label class="check-label drive-empty-approval"><input id="driveEmptyApproved" type="checkbox">Autorizo salvar uma cópia vazia. As cópias antigas continuam sujeitas ao limite do histórico.</label>'):''}<p class="drive-private">${icon('ShieldCheck')}Formatação, anotações e ensaios acompanham cada versão.</p></div>`,btn('drive-apply',backup?(payload.enable?translateUI('Confirmar e ativar'):translateUI('Confirmar backup')):beforeBackup||report?.conflicts.length?translateUI('Confirmar escolha'):translateUI('Recuperar esta cópia'),backup?'Upload':'CloudDownload')+btn('drive-later',translateUI('Agora não'),'','secondary'));mark('drive-review');
  }catch(e){toast(e.message||translateUI('Este backup não é válido. Seu caderno foi preservado.'));}
 }
 function safe(){return !info.busy&&!inflight&&foregroundVisible&&!document.hidden&&!rt.q&&!['reader','editor'].includes(rt.view)&&!rt.audio?.state?.includes('playing')&&!c.getState().speeches.some(s=>s.timer?.running||s.versions?.some(v=>v.timer?.running))&&(!$('.modal-backdrop')||rt.modal==='drive-settings');}
 async function applyChoice(policy='both',automatic=false,payload=preview,plan=null){
  if(merging||!payload)return;if(automatic&&(!eligible(payload)||!safe()))return;
  plan=plan||payload.plan;
  const backup=payload.mode==='backup',account=info.email,modal=rt.modal,emptyApproved=!!$('#driveEmptyApproved')?.checked;
  if(backup&&!payload.enable&&!c.getState().speeches.length&&(!payload.state||policy==='local'||!JSON.parse(payload.state).speeches.length)&&!emptyApproved){toast(translateUI('Confirme se deseja guardar um caderno vazio ou preserve os dados do Drive.'));return;}
  merging=true;
  try{
   if(!c.persist(true))throw Error(translateUI('Não foi possível salvar o caderno atual.'));const before=JSON.stringify(c.getState());
   if(plan&&plan.snapshot!==before)plan=await planDriveRestore(c.getState(),payload.state,await baseline());
   if(automatic&&plan?.report.conflicts.length){merging=false;void showDecision(payload,'read',plan);return;}
   const result=plan?.result&&policy==='both'&&plan.snapshot===before?plan.result:payload.state?await mergeDriveBackup(c.getState(),payload.state,{manual:!automatic,policy,...(automatic&&plan?{documentPolicies:plan.documents,categoryPolicies:plan.categories}:{})}):{changed:false,state:c.getState()};
   if(before!==JSON.stringify(c.getState()))throw Error(translateUI('O caderno mudou durante a leitura. Confira novamente para preservar suas alterações.'));
   if(account!==info.email||!info.connected||payload.account&&payload.account!==info.email)return;
   if(automatic&&(!eligible(payload)||!safe()||pending!==payload))return;
   if(!automatic&&rt.modal!==modal)return;
   if(result.changed&&!native.drivePrepareRestore())throw Error(translateUI('Não foi possível guardar sua cópia de recuperação.'));
   if(result.changed&&!c.commitRestore(result.state))throw Error(translateUI('Não foi possível salvar a restauração. Seu caderno foi preservado.'));
   if(backup){
    if(!c.persist(true))throw Error(translateUI('Não foi possível salvar antes do envio.'));const raw=JSON.stringify(c.getState()),localHash=await driveHash(raw);
    if(account!==info.email||rt.modal!==modal)return;if(raw!==JSON.stringify(c.getState()))throw Error(translateUI('O caderno mudou. Confira o backup novamente antes de enviar.'));
    preview=null;request('backup-confirm',JSON.stringify({ticket:payload.ticket,localHash,emptyApproved}));return;
   }
   const applied=JSON.parse(JSON.stringify(c.getState())),appliedIndex=!result.changed&&plan?JSON.parse(JSON.stringify(plan.localIndex)):await driveIndex(applied),remoteIndex=plan?.remoteIndex||await driveIndex(payload.state);
   if(account!==info.email)return;
   if(automatic&&plan?.dirtyLocal){Object.assign(appliedIndex.documents,plan.dirtyLocal.documents);Object.assign(appliedIndex.categories,plan.dirtyLocal.categories);}
   const outcome=policy==='local'?'kept-local':result.changed?'restored':'current';
   const receipt={id:payload.id,account,outcome,local:appliedIndex,remote:remoteIndex};
   if(!(native.driveCompleteRead?native.driveCompleteRead(JSON.stringify(receipt)):native.driveAckRead(payload.id)))throw Error(translateUI('Seu conteúdo foi salvo, mas não foi possível concluir a conferência. Tente novamente.'));if(pending?.id===payload.id&&pending.state===payload.state)pending=null;preview=null;info.needsReview=false;refreshEntry(true);
   if(!automatic){closeModal();settings();}else if(rt.modal==='drive-settings'){connectionNotice=result.changed?translateUI('Seu caderno foi atualizado com o backup do Drive.'):translateUI('Seu caderno já está atualizado com este backup.');settings();}if(result.changed)toast(result.alternatives?translateUI('Conteúdo preservado. Textos diferentes ficaram como versões no mesmo item.'):translateUI('Preparações recuperadas do Google Drive.'));else if(!automatic)toast(policy==='local'?translateUI('Conteúdo deste aparelho mantido.'):translateUI('Seu caderno já contém este backup.'));
  }catch(e){if(automatic){if(!pending||pending===payload)pending=payload;shownPending=pendingKey(payload);}toast(e.message||translateUI('Não foi possível concluir. Seu caderno foi preservado.'));}
  finally{merging=false;if(pending&&pending!==payload&&eligible(pending)&&safe())setTimeout(()=>void drain(),0);}
 }
 let baselineCache=null;
 async function baseline(){
  let saved={},meta={};try{saved=JSON.parse(native.driveReadBaseline?.()||'{}');meta=JSON.parse(native.driveBackupIndex?.()||'{}');}catch{}
  if(meta.account===info.email&&(meta.uploaded||meta.aligned)&&(saved.id!==meta.id||saved.local?.format!==2)){
   if(baselineCache?.account===info.email&&baselineCache.id===meta.id)return baselineCache;
   try{const source=JSON.parse(native.driveRestoreBase?.()||'{}');if(source.account===info.email&&source.id===meta.id&&source.state){const index=await driveIndex(source.state);baselineCache={account:info.email,id:meta.id,local:index,remote:index,state:source.state};return baselineCache;}}catch{}
  }
  return saved.account===info.email?saved:null;
 }
 async function drain(){
  if(planning||merging||!eligible(pending)||!safe()||shownPending===pendingKey(pending))return;
  const payload=pending,account=info.email,original=JSON.stringify(c.getState());planning=true;
  try{
   const saved=await baseline(),plan=await planDriveRestore(c.getState(),payload.state,saved?.account===account?saved:null);
   if(account!==info.email||payload!==pending||!eligible(payload)||!safe())return;
   if(original!==JSON.stringify(c.getState())){setTimeout(()=>void drain(),0);return;}
   if(plan.report.conflicts.length||!info.autoRead&&plan.result?.changed)void showDecision(payload,'read',plan);
   else {planning=false;await applyChoice('both',true,payload,plan);}
  }catch(e){shownPending=pendingKey(payload);toast(e.message||translateUI('Não foi possível recuperar o backup.'));}
  finally{planning=false;if(pending&&pending!==payload&&eligible(pending)&&safe())setTimeout(()=>void drain(),0);}
 }
 function loadPending(){if(!native.drivePending)return;try{const p=JSON.parse(native.drivePending()||'{}');if(p.state&&eligible(p)){if(pending&&pendingKey(pending)===pendingKey(p)&&pending.state===p.state&&pending.reason===p.reason)return;pending=p;}else pending=null;}catch{}}
 function checkEntry(){const last=Number(info.lastCheckAttemptAt)||0;if(!foregroundVisible||document.hidden||!info.connected||!info.autoRead){checkOnIdle=false;return;}if(last&&Date.now()>=last&&Date.now()-last<900000){checkOnIdle=false;return;}if(info.busy||inflight){checkOnIdle=true;return;}checkOnIdle=false;request('check');}
 function foreground(){foregroundVisible=true;shownPending='';refreshEntry(true);loadPending();drain();checkEntry();}
 function received(event){
  const data=event.detail||{};if(data.kind!=='progress'&&data.requestId===lastRequest){inflight=false;activeAction='';}
  if(data.status){const accountChanged=data.status.email!==info.email;if(accountChanged){pending=null;preview=null;files=[];shownPending='';baselineCache=null;}info={...info,...data.status};if(accountChanged&&rt.modal==='drive-review')settings();}
  if(!data.error&&data.status&&!data.status.busy&&!data.status.error)connectionNotice='';
  if(data.status&&!data.status.busy&&!data.payload?.automatic)loadPending();
  if(data.errorCode==='cancelled')connectionNotice=data.error||translateUI('Conexão cancelada.');else if(data.error||data.status?.error||['connect','disconnect'].includes(data.kind))connectionNotice='';refreshEntry();
  if(Array.isArray(data.files))files=data.files;
  if(data.kind==='progress'){if(rt.modal==='drive-settings')settings();return;}
  if(data.error&&data.errorCode!=='cancelled'&&data.errorCode!=='busy'&&data.kind!=='check'&&rt.modal!=='drive-settings')toast(data.error);
  if(data.payload?.state&&data.payload.automatic)pending=data.payload;
  if(['drive-settings','drive-offer'].includes(rt.modal))settings();
  if(data.error){if(rt.modal==='drive-loading')settings();if(checkOnIdle&&!info.busy)checkEntry();return;}
  if(data.payload?.mode==='backup-review'){if(rt.modal==='drive-settings')showDecision(data.payload,'backup');else toast(translateUI('Backup conferido. Volte aos Ajustes para confirmar o envio.'));}
  else if(data.payload?.state){if(data.payload.automatic){pending=data.payload;drain();}else if(['drive-settings','drive-loading'].includes(rt.modal)){const file=files.find(file=>file.id===data.payload.id);showDecision({...data.payload,at:data.payload.at||file&&fileTime(file)},'restore');}}
  if(data.kind==='list'&&rt.modal==='drive-loading')list();
  if(data.kind==='connect'&&info.connected){toast(translateUI('Google Drive conectado com sucesso.'));if(info.autoRead)foreground();}
  if(data.kind==='backup-confirm'&&data.payload?.saved)toast(data.payload.saved.empty?translateUI('Backup automático ativado. Um caderno vazio não foi enviado.'):data.payload.saved.unchanged?translateUI('Sua cópia já está atualizada.'):translateUI('Backup salvo no seu Google Drive.'));
  if(data.kind==='auto-read'&&info.autoRead)foreground();
  if(data.kind==='disconnect'){pending=null;preview=null;files=[];checkOnIdle=false;toast(translateUI('Conta desconectada. Os backups continuam no Google Drive.'));}
  if(!info.busy&&!inflight){loadPending();void drain();}
  if(checkOnIdle&&!info.busy&&!inflight)checkEntry();
 }
 function handle(action,id){switch(action){
  case 'drive-settings':settings();break;
  case 'drive-dismiss':case 'drive-later':closeModal();break;
  case 'drive-connect':request('connect');break;
  case 'drive-backup':request('prepare-backup');break;
  case 'drive-list':request('list');break;
  case 'drive-preview':request('restore',id);break;
  case 'drive-apply':void applyChoice($('input[name="drivePolicy"]:checked')?.value||'both');break;
  case 'drive-review-pending':loadPending();if(pending)showDecision(pending);else toast(translateUI('Abra o app novamente para conferir a próxima cópia disponível.'));break;
  case 'drive-disconnect-confirm':openModal(translateUI('Desconectar o Google Drive?'),htmlUI('<p class="help">Os envios e a leitura automática serão desativados neste aparelho. Seu caderno e os backups existentes serão preservados.</p>'),btn('drive-settings',translateUI('Voltar'),'','secondary')+btn('drive-disconnect',translateUI('Desconectar'),'CloudOff','danger'));mark('drive-disconnect');break;
  case 'drive-disconnect':request('disconnect');break;
  default:return false;
 }return true;}
 function start(){
  update();if(!supported())return;loadPending();window.addEventListener('nativeDrive',received);offer();
  window.addEventListener('focus',()=>refreshEntry(true));window.addEventListener('nativeForeground',foreground);window.addEventListener('nativeBackground',()=>{foregroundVisible=false;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)foregroundVisible=false;else if(!foregroundVisible)foreground();});foreground();
 }
 return {handle,start,drain,settingsEntry,cardIndicator,refreshCards,isBusy:()=>merging||inflight||planning||info.busy};
}
