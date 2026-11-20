import {backupContentIndex} from '../protection/drive-backup-state.js';

const messages={
 'pt-BR':{saving:'Salvando rascunho…',saved:'Salvo no aparelho',draft:'Rascunho salvo no aparelho',error:'Falha ao salvar no aparelho',create:'Criar apresentação',apply:'Atualizar apresentação',view:'Visualizar',disconnected:'Drive não conectado',reconnect:'Drive: reconectar',review:'Drive: conferir versões',pending:'Drive: backup pendente',offline:'Drive: sem internet',busy:'Drive: atualizando…',failed:'Drive: falha no backup',manual:'Drive: envio manual',checking:'Drive: conferindo…',cloud:'Salvo no Drive',cloudDraft:'Rascunho no Drive',unavailable:'Drive: não foi possível conferir',last:'Última confirmação',open:'Abrir backup e recuperação',localHelp:'O rascunho é salvo automaticamente neste aparelho.',applyHelp:'Atualizar apresentação aplica as alterações do rascunho.',createHelp:'Criar apresentação confirma este rascunho.'},
 en:{saving:'Saving draft…',saved:'Saved on device',draft:'Draft saved on device',error:'Could not save on device',create:'Create presentation',apply:'Update presentation',view:'View',disconnected:'Drive not connected',reconnect:'Drive: reconnect',review:'Drive: review versions',pending:'Drive: backup pending',offline:'Drive: offline',busy:'Drive: updating…',failed:'Drive: backup failed',manual:'Drive: send manually',checking:'Drive: checking…',cloud:'Saved to Drive',cloudDraft:'Draft on Drive',unavailable:'Drive: could not verify',last:'Last confirmation',open:'Open backup and recovery',localHelp:'Your draft is saved automatically on this device.',applyHelp:'Update presentation applies the draft changes.',createHelp:'Create presentation confirms this draft.'},
 es:{saving:'Guardando borrador…',saved:'Guardado en el dispositivo',draft:'Borrador guardado aquí',error:'No se pudo guardar aquí',create:'Crear presentación',apply:'Actualizar presentación',view:'Ver',disconnected:'Drive no conectado',reconnect:'Drive: reconectar',review:'Drive: revisar versiones',pending:'Drive: copia pendiente',offline:'Drive: sin conexión',busy:'Drive: actualizando…',failed:'Drive: error de copia',manual:'Drive: envío manual',checking:'Drive: comprobando…',cloud:'Guardado en Drive',cloudDraft:'Borrador en Drive',unavailable:'Drive: no se pudo verificar',last:'Última confirmación',open:'Abrir copias y recuperación',localHelp:'El borrador se guarda automáticamente en este dispositivo.',applyHelp:'Actualizar presentación aplica los cambios del borrador.',createHelp:'Crear presentación confirma este borrador.'},
 ja:{saving:'下書きを保存中…',saved:'この端末に保存済み',draft:'下書きを端末に保存済み',error:'端末への保存に失敗',create:'発表を作成',apply:'発表を更新',view:'表示',disconnected:'Drive未接続',reconnect:'Drive：再接続が必要',review:'Drive：バージョンを確認',pending:'Drive：バックアップ待ち',offline:'Drive：オフライン',busy:'Drive：更新中…',failed:'Drive：バックアップ失敗',manual:'Drive：手動送信',checking:'Drive：確認中…',cloud:'Driveに保存済み',cloudDraft:'下書きをDriveに保存済み',unavailable:'Drive：確認できません',last:'最終確認',open:'バックアップと復元を開く',localHelp:'下書きはこの端末に自動保存されます。',applyHelp:'「発表を更新」で下書きの変更を反映します。',createHelp:'「発表を作成」で下書きを確定します。'}
};
for(const [language,label]of Object.entries({'pt-BR':'Editor',en:'Editor',es:'Editor',ja:'編集'}))messages[language].editor=label;
export const protectionText=(language,key)=>(messages[language]||messages['pt-BR'])[key];

// A timestamp or connection alone never proves that this editor content is backed up.
export function driveProtection({info={},receipt={},hash,documentId,phase='saved',online=true}){
 if(!info.connected)return {key:'disconnected',icon:'CloudOff',tone:'neutral'};
 if(info.needsReconnect)return {key:'reconnect',icon:'CloudAlert',tone:'warning'};
 if(info.needsReview)return {key:'review',icon:'CloudAlert',tone:'warning'};
 if(phase==='saved'&&hash&&receipt.account===info.email&&receipt.documents?.[documentId]===hash&&Number(receipt.at)>0)return {key:'cloud',icon:'CloudCheck',tone:'saved',at:Number(receipt.at)};
 if(!online)return {key:'offline',icon:'CloudOff',tone:'pending'};
 if(info.backupError||info.configError||info.error&&info.errorCode!=='cancelled')return {key:'failed',icon:'CloudAlert',tone:'warning'};
 if(info.busy)return {key:'busy',icon:'CloudUpload',tone:'pending'};
 if(info.autoBackup===false)return {key:'manual',icon:'CloudUpload',tone:'pending'};
 return {key:'pending',icon:'CloudUpload',tone:'pending'};
}

export function createEditorProtection({getState,getDocument,isDirty,readStatus,readReceipt,icon,index=backupContentIndex}){
 let phase='saved',generation=0,lastIndex=null;
 const text=key=>protectionText(getState().settings.language,key);
 const context=()=>{try{const info=readStatus();return {info,receipt:phase==='saved'&&info.connected?readReceipt():{},online:navigator.onLine!==false};}catch{return {info:{},receipt:{},unavailable:true};}};
 const set=(node,label,symbol,tone,title=label)=>{
  if(!node)return;node.dataset.tone=tone;node.title=title;node.setAttribute('aria-label',label+(node.tagName==='BUTTON'?' · '+text('open'):''));
  // Keep keyboard focus and the button stable while status events arrive.
  if(node.dataset.label!==label||node.dataset.symbol!==symbol){node.innerHTML=icon(symbol);const span=document.createElement('span');span.textContent=label;node.append(span);node.dataset.label=label;node.dataset.symbol=symbol;}
 };
 function paintCloud(model,dirty){
  const node=document.getElementById('editorDriveStatus');let label=text(model.key==='cloud'&&dirty?'cloudDraft':model.key),title=label;
  if(model.at){const date=new Date(model.at),language=getState().settings.language,locale=language==='pt-BR'?'pt-BR':language;
   const sameDay=date.toDateString()===new Date().toDateString();
   label+=' · '+date.toLocaleString(locale,sameDay?{hour:'2-digit',minute:'2-digit'}:{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
   title=label+' · '+text('last')+': '+date.toLocaleString(locale);
  }
  set(node,label,model.icon,model.tone,title);
 }
 async function refresh(){
  const current=++generation,local=document.getElementById('saveStatus'),cloud=document.getElementById('editorDriveStatus'),doc=getDocument();if(!local||!cloud||!doc)return;
  const dirty=isDirty(),key=phase==='saving'?'saving':phase==='error'?'error':dirty?'draft':'saved';
  set(local,text(key),phase==='saving'?'Save':phase==='error'?'AlertCircle':'CheckCheck',phase==='error'?'warning':phase==='saving'?'pending':'saved',text(key)+(phase==='error'?'':' · '+text('localHelp')));
  const initial=context();if(initial.unavailable){paintCloud({key:'unavailable',icon:'CloudAlert',tone:'warning'},dirty);return;}
  const base=driveProtection({...initial,documentId:doc.id,phase});paintCloud(base,dirty);
  if(phase!=='saved'||!initial.info.connected||initial.info.needsReconnect||initial.info.needsReview)return;
  const raw=JSON.stringify(getState()),account=initial.info.email;
  try{
   const content=lastIndex?.raw===raw?lastIndex.content:await index(raw);
   if(current!==generation||getDocument()?.id!==doc.id)return;
   const latest=context();if(latest.unavailable||latest.info.email!==account){void refresh();return;}
   lastIndex={raw,content};paintCloud(driveProtection({...latest,hash:content.documents[doc.id],documentId:doc.id,phase}),isDirty());
  }catch{if(current===generation)paintCloud({key:'unavailable',icon:'CloudAlert',tone:'warning'},dirty);}
 }
 const mark=value=>{phase=value;void refresh();};
 for(const event of ['nativeDrive','online','offline','focus'])window.addEventListener(event,()=>void refresh());
 return {mark,refresh,text};
}
