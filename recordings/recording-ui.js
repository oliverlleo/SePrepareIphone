import {recordingId,recordingHash,recordingSnapshotHash,groupRecordings,audioExtension} from './recording-core.js';
import {createRecordingStore} from './recording-store.js';
import {createBrowserRecordingCapture,createNativeRecordingBridge,createNativeRecordingCapture} from './recording-capture.js';
import {createRecordingSync} from './recording-sync.js';
import {createRecordingText} from './recording-i18n.js';

// Audio is deliberately independent of document saves and shared preparation exports.
export function createRecordingUI(host){
 const store=createRecordingStore(),t=createRecordingText(()=>host.getState().settings.language),native=host.native?.recordingCommand?createNativeRecordingBridge(host.native):null;
 const owner=recordingId(),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const $=s=>document.querySelector(s),icon=name=>host.icon(({HardDrive:'Save',Layers:'Copy',CloudCheck:'Cloud',RotateCw:'Redo2',RefreshCw:'RotateCcw'})[name]||name),clock=ms=>{const n=Math.floor((ms||0)/1000);return (n>=3600?Math.floor(n/3600)+':':'')+String(Math.floor(n/60)%60).padStart(2,'0')+':'+String(n%60).padStart(2,'0');};
 const bytes=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.ceil(n/1024)+' KB';
 const date=at=>new Intl.DateTimeFormat(host.getState().settings.language,{dateStyle:'medium',timeStyle:'short'}).format(at);
 const button=(action,label,glyph,extra='',cls='')=>`<button type="button" class="rec-button ${cls}" title="${esc(label)}" aria-label="${esc(label)}" data-action="${action}" ${extra}>${glyph?icon(glyph):''}<span>${esc(label)}</span></button>`;
 let shareFile=null;let active=null,capture=null,starting=false,saving=null,internal=false,leaseTimer,manager=null,records=[],selected=new Set(),player=null,objectUrl='',syncer=null,transportRef=null,syncError='',lastSync=0,selectionToken=0;
 function account(){try{const status=JSON.parse(host.getDrive()?.driveStatus()||'{}');return status.connected?String(status.email||''):'';}catch{return '';}}
 function transport(){const drive=host.getDrive();if(native)return nativeTransport();return drive?.recordingTransport;}
 let nativeTransportCache,syncRetry;
 const noun=n=>t(n===1?'recordingNoun':'recordings');
 function nativeTransport(){return nativeTransportCache||=(Object.fromEntries([
  ['list',()=>native.request('drive-list')],['read',id=>native.request('drive-read','',{id})],['snapshot',id=>native.request('drive-snapshot','',{id})],
  ['putSnapshot',(hash,data)=>native.request('drive-put-snapshot','',{hash,data})],['putMeta',(data,id)=>native.request('drive-put-meta','',{data,id:id||''})],
  ['uploadNative',record=>native.request('drive-upload','',{record})],['downloadNative',(id,record)=>native.request('drive-download','',{id,record})],['removeAudio',id=>native.request('drive-remove-audio','',{id})]
 ]));}
 function ensureSync(){const next=transport();if(!next)return null;if(next!==transportRef){transportRef=next;syncer=createRecordingSync({store,transport:next,account,readBlob:readBlob,removeLocal,onChange:()=>{if(manager)void refreshManager();}});}return syncer;}
 function fail(error,kind='audioError'){console.error('SePrepare recording:',error);host.toast(t(/NotAllowed|Security|permiss/i.test(error?.name+' '+error?.message)?'permission':/Quota|espaço|storage/i.test(error?.name+' '+error?.message)?'storageError':kind));}
 function current(){const s=host.getActive();return s&&{s,v:s.versions?.find(v=>v.id===s.activeVersionId)||s};}
 function elapsed(s){const timer=s?.timer||{};return (timer.elapsedMs||0)+(timer.running?Math.max(0,Date.now()-timer.startedAt):0);}
 function sameContext(){const c=current();return c&&c.s.id===active?.speechId&&(c.s.activeVersionId||c.v.id)===active?.versionId;}
 async function startRecording(){
  if(active||starting||saving){host.toast(t('busy'));return;}
  const c=current();if(!c)return;if(!native&&(!globalThis.MediaRecorder||!navigator.mediaDevices?.getUserMedia)){host.toast(t('unsupported'));return;}
  starting=true;mount();let created=false;
  try{
   if(!await store.lease(owner))throw Error(t('otherTab'));
   leaseTimer=setInterval(()=>{void store.lease(owner).then(ok=>{if(!ok)void interrupted();}).catch(()=>void interrupted());},5000);
   const snapshot={schema:1,speechId:c.s.id,versionId:c.s.activeVersionId||c.v.id,title:c.s.title,versionName:c.v.name||'',type:c.s.type==='part'?'part':'speech',delta:structuredClone(c.s.delta),participants:structuredClone(c.s.participants||[])};
   const snapshotId=await recordingSnapshotHash(snapshot),at=Date.now();
   active={schema:1,id:recordingId(),speechId:c.s.id,versionId:snapshot.versionId,versionName:snapshot.versionName,title:c.s.title,type:snapshot.type,snapshotId,createdAt:at,updatedAt:at,durationMs:0,bytes:0,status:'recording',mime:'audio/mp4',localAvailable:false,storage:native?'native':'browser',offsetMs:elapsed(c.s),sessionStartedAt:at-elapsed(c.s),cloud:{},paused:false};
   await store.create(active,snapshot);created=true;
   capture=native?createNativeRecordingCapture(native):createBrowserRecordingCapture({store,onInterruption:()=>void interrupted()});
   const info=await capture.start(active);await store.patch(active.id,{mime:info.mime||active.mime});
   // No timer mutation until microphone acquisition and durable metadata succeed.
   if(!c.s.timer?.running)host.toggleTimer();
   leaseTimer=setInterval(()=>{void store.lease(owner).then(ok=>{if(!ok)void interrupted();}).catch(()=>void interrupted());},5000);
   navigator.storage?.persist?.().catch(()=>{});
  }catch(error){if(capture)try{await capture.finish();}catch{}if(created)await store.patch(active.id,{status:'failed'}).catch(()=>{});active=null;capture=null;await store.lease(owner,true).catch(()=>{});if(error.message===t('otherTab'))host.toast(error.message);else fail(error);}
  finally{if(!active)clearInterval(leaseTimer);starting=false;mount();tick();}
 }
 async function finish(options,interruption=false){
  if(saving)return saving;if(!active)return false;
  if(sameContext()&&host.getActive()?.timer?.running)host.toggleTimer();
  const record=active,cap=capture;clearInterval(leaseTimer);starting=false;
  saving=(async()=>{
   let result;
   try{
    result=await cap.finish();
    const fields=native?{mime:result.mime,bytes:result.bytes,sha256:result.sha256,durationMs:result.durationMs,localAvailable:!!result.localAvailable}:{};
    if(!native){const meta=await store.getRecord(record.id),blob=await store.blob(record.id);if(!blob?.size)throw Error(t('noAudio'));Object.assign(fields,{mime:meta.mime,bytes:blob.size,sha256:await recordingHash(blob),durationMs:result.durationMs,localAvailable:true});}
    if(!fields.localAvailable||!fields.bytes)throw Error(t('noAudio'));
    internal=true;try{host.finishRehearsal(options);}finally{internal=false;}
    const c=current(),rehearsal=c?.v.rehearsals?.at(-1);
    await store.patch(record.id,{...fields,status:'ready',interrupted:interruption||!!result.error,rehearsalAt:rehearsal?.at||Date.now(),updatedAt:Date.now()});
    active=null;capture=null;showSaved(record.id,interruption);if(await store.setting('autoBackup')!==false)void sync(false);
    return true;
   }catch(error){if(sameContext()&&host.getActive()?.timer?.running)host.toggleTimer();active=null;capture=null;host.toast(t('audioError'));console.error('Recording finalization failed; journal retained',error);return false;}
   finally{await store.lease(owner,true).catch(()=>{});saving=null;mount();tick();}
  })();mount();return saving;
 }
 async function interrupted(){if(!active||saving||starting)return;if(sameContext()&&host.getActive()?.timer?.running)host.toggleTimer();host.pauseRehearsal?.();await finish(undefined,true);}
 function interceptFinish(options){if(internal||!active&&!saving&&!starting)return false;if(starting){host.toast(t('busy'));return true;}void finish(options);return true;}
 function guard(callback){if(!active&&!saving&&!starting)return false;if(starting||saving){host.toast(t('busy'));return true;}host.openModal(t('leaveTitle'),`<div class="rec-confirm"><p>${esc(t('leaveHelp'))}</p><p class="help">${esc(t('neverReplace'))}</p></div>`,button('recording-cancel',t('continue'),'ArrowLeft')+button('recording-save-leave',t('saveLeave'),'Check','','rec-primary'));host.rt.modal='recording-leave';pendingNavigation=callback;return true;}
 let pendingNavigation=null;
 function tick(){
  if(active&&!starting&&!saving&&sameContext()){
   const running=!!host.getActive()?.timer?.running;
   if(capture&&Boolean(active.paused)===running){active.paused=!running;Promise.resolve(running?capture.resume():capture.pause()).catch(()=>void interrupted());}
  }
  const button=$('[data-action="recording-start"]');if(button){const busy=starting||!!saving;button.disabled=busy;button.dataset.active=String(!!active);button.setAttribute('aria-pressed',String(!!active));button.title=t(saving?'saving':starting?'loading':active?(host.getActive()?.timer?.running?'pause':'resume'):'record');button.setAttribute('aria-label',button.title);const text=button.querySelector('span');if(text)text.textContent=t(saving?'savingShort':starting?'loadingShort':active?(host.getActive()?.timer?.running?'recording':'resumeShort'):'recordShort');}
  const primaryLabel=$('#startTimerLabel');if(primaryLabel&&active)primaryLabel.textContent=t(host.getActive()?.timer?.running?'pause':'resume');
  const dock=$('#recordingDockMark');if(dock){dock.hidden=!active;dock.title=t('recording');dock.setAttribute('aria-label',t('recording'));dock.dataset.paused=String(!host.getActive()?.timer?.running);}
 }
 function mount(){
  const row=$('.reader-primary-timer');if(row&&!row.querySelector('[data-action="recording-start"]'))row.insertAdjacentHTML('beforeend',button('recording-start',t('recordShort'),'Mic','','rec-start'));
  const dock=$('#timerDock');if(dock&&!$('#recordingDockMark'))dock.insertAdjacentHTML('afterbegin','<span id="recordingDockMark" class="rec-dot" hidden></span>');tick();
 }
 function showSaved(id,interruption){host.toast(t(interruption?'interrupted':'saved'));const toast=$('#toast');if(toast){toast.append(document.createTextNode(' '));const b=document.createElement('button');b.type='button';b.dataset.action='recording-open-saved';b.dataset.id=id;b.textContent=t('listen');toast.append(b);}}
 function cleanupPlayer(){selectionToken++;shareFile=null;if(player){const slot=player.closest('.rec-player-slot');player.onerror=null;player.pause();player.removeAttribute('src');player.load();slot?.replaceChildren();player=null;}if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl='';}}
 async function readBlob(record){if(native){const response=await fetch(native.url(record.id));if(!response.ok)throw Error(t('audioError'));return response.blob();}return store.blob(record.id);}
 async function removeLocal(record){if(native&&record.storage==='native')await native.request('remove',record.id);await store.evict(record.id);}
 function status(record){const receipt=record.cloud?.[account()],protectedCopy=!!receipt?.audioId&&receipt.hash===record.sha256&&!receipt.deleted;return t(!record.localAvailable?'cloudOnly':protectedCopy?'protected':'local');}
 function card(record){const chosen=selected.has(record.id);return `<article class="rec-item" data-recording-id="${esc(record.id)}"><div class="rec-item-line"><label class="rec-select"><input type="checkbox" data-rec-select="${esc(record.id)}" ${chosen?'checked':''} aria-label="${esc(t('select'))}"></label><button type="button" class="rec-play" data-action="recording-play" data-id="${esc(record.id)}" aria-label="${esc(t(record.localAvailable?'listen':'download'))}">${icon(record.localAvailable?'Play':'CloudDownload')}</button><div class="rec-item-copy"><strong>${esc(date(record.createdAt))}</strong><small>${clock(record.durationMs)} · ${esc(bytes(record.bytes))}${record.interrupted?' · '+esc(t('recovered')):''}</small><small class="rec-cloud">${icon(record.cloud?.[account()]?.audioId?'CloudCheck':'HardDrive')}${esc(status(record))}</small></div>${button('recording-delete',t('remove'),'Trash2',`data-id="${esc(record.id)}"`,'rec-icon-only')}</div><div class="rec-player-slot"></div></article>`;}
 function timedRehearsals(){if(!manager?.versionId)return '';const s=host.getState().speeches.find(s=>s.id===manager.speechId),v=s?.versions?.find(v=>v.id===manager.versionId),timed=(v?.rehearsals||[]).filter(r=>!records.some(a=>a.status==='ready'&&a.rehearsalAt===r.at&&a.versionId===v.id));return timed.length?`<details class="rec-timed"><summary>${icon('Timer')}${esc(t('noAudio'))} · ${timed.length}</summary>${timed.slice().reverse().map(r=>`<div class="rec-timed-row"><span>${esc(date(r.at))}</span><strong>${clock(r.duration)}</strong></div>`).join('')}</details>`:'';}
 function managerContent(){
  const visible=records.filter(r=>r.status==='ready'&&(!manager?.speechId||r.speechId===manager.speechId)&&(!manager?.versionId||r.versionId===manager.versionId)),groups=groupRecordings(visible,{query:manager?.query||'',type:manager?.type||'all'}),total=visible.reduce((n,r)=>n+(r.localAvailable?r.bytes:0),0);
  return `<section class="rec-library"><p class="rec-description">${esc(t('description'))}</p><div class="rec-stats"><span>${visible.length} ${esc(noun(visible.length))}</span><span>${esc(t('space'))}: <strong>${bytes(total)}</strong></span></div><div class="rec-search"><label>${icon('Search')}<input type="search" id="recordingSearch" placeholder="${esc(t('search'))}" value="${esc(manager.query||'')}"></label><select id="recordingType" aria-label="${esc(t('parts'))}">${['all','speeches','parts'].map((key,i)=>`<option value="${['all','speech','part'][i]}" ${manager.type===['all','speech','part'][i]?'selected':''}>${esc(t(key))}</option>`).join('')}</select></div><div class="rec-library-tools">${button('recording-select-all',t('selectAll'),'CheckCheck')}${button('recording-clear',t('clear'),'X')}${button('recording-delete-selected',t('deleteSelected'),'Trash2',selected.size?'':'disabled')}</div><div class="rec-groups">${groups.map(g=>`<details class="rec-group" ${manager.speechId?'open':''}><summary>${icon(g.type==='part'?'Users':'Mic')}<span><strong>${esc(g.title)}</strong><small>${g.count} ${esc(noun(g.count))} · ${bytes(g.bytes)}</small></span>${icon('ChevronDown')}</summary><div class="rec-scope-tools">${button('recording-delete-preparation',t('deletePreparation'),'Trash2',`data-id="${esc(g.id)}"`)}</div>${g.versions.map(v=>`<details class="rec-version" ${manager.versionId?'open':''}><summary>${icon('Layers')}<span><strong>${esc(v.name)}</strong><small>${v.count} ${esc(noun(v.count))} · ${bytes(v.bytes)}</small></span>${icon('ChevronDown')}</summary><div class="rec-scope-tools">${button('recording-delete-version',t('deleteVersion'),'Trash2',`data-id="${esc(g.id)}" data-version="${esc(v.id)}"`)}</div>${v.records.map(card).join('')}</details>`).join('')}</details>`).join('')||`<div class="rec-empty">${icon('Mic')}<h3>${esc(t(manager.query?'noResults':'empty'))}</h3><p>${esc(t('emptyHelp'))}</p></div>`}</div>${timedRehearsals()}<details class="rec-drive"><summary>${icon('Cloud')}Google Drive${icon('ChevronDown')}</summary><p>${esc(t('driveHint'))}</p><label class="rec-auto"><input type="checkbox" id="recordingAutoBackup" checked><span>${esc(t('autoBackup'))}</span></label>${button('recording-sync',t(syncer?.isBusy()?'syncing':account()?'sync':'connect'),'RefreshCw',syncer?.isBusy()?'disabled':'')}<p class="rec-sync-error" role="status">${esc(syncError)}</p>${records.some(r=>r.status==='deleted'&&Object.values(r.cloud||{}).some(c=>!c.deleted))?`<p class="help">${esc(t('deletePending'))}</p>`:''}</details>${button('recording-delete-all',t('deleteAll'),'Trash2',visible.length?'':'disabled','rec-delete-all')}</section>`;
 }
 async function openManager(scope={}){cleanupPlayer();const next={query:'',type:'all',...scope};host.closeModal();manager=next;selected.clear();records=await store.list();host.openModal(t(scope.versionId?'versionRehearsals':'manage'),managerContent());host.rt.modal='recording-library';$('.modal')?.classList.add('rec-dialog');bindManager();}
 function bindManager(){const search=$('#recordingSearch');search?.addEventListener('input',()=>{manager.query=search.value;renderLibrary(true);});$('#recordingType')?.addEventListener('change',e=>{manager.type=e.target.value;renderLibrary();});$('#recordingAutoBackup')?.addEventListener('change',e=>{void store.setSetting('autoBackup',e.target.checked);});void store.setting('autoBackup').then(value=>{const check=$('#recordingAutoBackup');if(check)check.checked=value!==false;});document.querySelectorAll('[data-rec-select]').forEach(input=>input.addEventListener('change',()=>{input.checked?selected.add(input.dataset.recSelect):selected.delete(input.dataset.recSelect);const b=$('[data-action="recording-delete-selected"]');if(b)b.disabled=!selected.size;}));}
 function renderLibrary(restoreSearch=false){if(!manager||host.rt.modal!=='recording-library')return;const opened=[...document.querySelectorAll('.rec-group[open],.rec-version[open]')].map(n=>n.querySelector('strong')?.textContent);cleanupPlayer();const body=$('.modal-body'),scroll=body.scrollTop;body.innerHTML=managerContent();for(const detail of body.querySelectorAll('.rec-group,.rec-version'))if(opened.includes(detail.querySelector('strong')?.textContent))detail.open=true;bindManager();body.scrollTop=scroll;if(restoreSearch){const input=$('#recordingSearch');input?.focus();input?.setSelectionRange?.(input.value.length,input.value.length);}}
 async function refreshManager(){records=await store.list();if(!player)renderLibrary();}
 async function play(id){
  cleanupPlayer();const token=selectionToken;let record=await store.getRecord(id);if(!record||record.status!=='ready')return;
  try{
   if(!record.localAvailable){host.toast(t('loading'));const s=ensureSync();if(!s)throw Error(t('driveError'));record=await s.download(record);records=await store.list();}
   if(token!==selectionToken||!manager)return;
   let slot=document.querySelector(`[data-recording-id="${id}"] .rec-player-slot`);if(!slot)return;
   let url;if(native&&record.storage==='native')url=native.url(id);else{const blob=await readBlob(record);shareFile={id,file:new File([blob],'SePrepare-'+new Date(record.createdAt).toISOString().slice(0,10)+'.'+audioExtension(record.mime),{type:record.mime})};url=objectUrl=URL.createObjectURL(blob);}if(token!==selectionToken){if(objectUrl)URL.revokeObjectURL(objectUrl);return;}
   slot.innerHTML=`<div class="rec-player"><audio controls preload="metadata"></audio><div class="rec-player-tools">${button('recording-seek-back',t('back10'),'RotateCcw','','rec-icon-only')}<label>${esc(t('speed'))}<select id="recordingSpeed">${[.75,1,1.25,1.5,2].map(n=>`<option value="${n}" ${n===1?'selected':''}>${n}×</option>`).join('')}</select></label>${button('recording-seek-forward',t('forward10'),'RotateCw','','rec-icon-only')}</div><div class="rec-record-actions">${button('recording-text',t('text'),'FileText',`data-id="${id}"`)}${button('recording-share',t('share'),'Share2',`data-id="${id}"`)}</div>${record.offsetMs?`<p class="help">${esc(t('startedAt',{time:clock(record.offsetMs)}))}</p>`:''}<div class="rec-text" hidden></div></div>`;
   player=slot.querySelector('audio');player.src=url;player.onerror=()=>fail(Error('Playback error'));slot.querySelector('select').onchange=e=>{player.playbackRate=Number(e.target.value);};await player.play().catch(()=>{});
  }catch(error){fail(error,record.localAvailable?'audioError':'driveError');}
 }
 async function showText(id){const row=document.querySelector(`[data-recording-id="${id}"] .rec-text`);if(!row)return;if(!row.hidden){row.hidden=true;return;}const record=await store.getRecord(id),snapshot=await store.snapshot(record.snapshotId);row.textContent=snapshot?.delta?.ops?.map(op=>typeof op.insert==='string'?op.insert:'').join('')||t('snapshotMissing');row.hidden=false;}
 async function share(id){try{if(shareFile?.id===id&&navigator.canShare?.({files:[shareFile.file]})){await navigator.share({files:[shareFile.file]});return;}const record=await store.getRecord(id);if(native&&record.storage==='native'){await native.request('share',id,{title:t('share'),mime:record.mime.split(';')[0]});return;}const blob=await readBlob(record);if(!blob)throw Error(t('audioError'));const file=new File([blob],'SePrepare-'+new Date(record.createdAt).toISOString().slice(0,10)+'.'+audioExtension(record.mime),{type:record.mime});if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:record.title});else {const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}}catch(error){if(error.name!=='AbortError')fail(error);}}
 let deleting=[];
 function askDelete(ids){deleting=records.filter(r=>ids.includes(r.id)&&r.status==='ready');if(!deleting.length)return;const canEvict=deleting.every(r=>r.localAvailable&&Object.values(r.cloud||{}).some(c=>c.audioId&&c.hash===r.sha256&&!c.deleted));cleanupPlayer();host.openModal(t('confirm'),`<div class="rec-confirm"><p>${deleting.length} ${esc(noun(deleting.length))}</p><p>${esc(t('keepHistory'))}</p>${canEvict?button('recording-evict',t('evict'),'HardDrive')+`<p class="help">${esc(t('evictHelp'))}</p>`:''}${button('recording-permanent',t('permanent'),'Trash2','','rec-danger')}<p class="help">${esc(t('permanentHelp'))}</p></div>`,button('recording-return',t('cancel'),'ArrowLeft'));host.rt.modal='recording-delete';}
 async function erase(permanent){const todo=deleting;deleting=[];try{for(const r of todo){if(permanent)await store.patch(r.id,{status:'deleted',deletedAt:Date.now(),updatedAt:Date.now()});await removeLocal(r);}selected.clear();await openManager(manager||{});host.toast(t('deleteDone'));if(permanent)void sync(false);}catch(error){fail(error);await openManager(manager||{});}}
 async function sync(manual=true){try{const s=ensureSync();if(!account()||!s){if(manual){const el=document.createElement('button');el.dataset.action='drive-settings';document.body.append(el);el.click();el.remove();}return;}if(!manual&&Date.now()-lastSync<10000){clearTimeout(syncRetry);syncRetry=setTimeout(()=>void store.setting('autoBackup').then(enabled=>{if(enabled!==false)void sync(false);}).catch(()=>{}),10050-(Date.now()-lastSync));return;}clearTimeout(syncRetry);lastSync=Date.now();syncError='';await s.sync();if(manual)host.toast(t('syncDone'));await refreshManager();}catch(error){syncError=t('driveError');console.error('Recording Drive sync',error);if(manual)host.toast(syncError);await refreshManager();}}
 function appendVersionEntry(){const list=$('.version-list')||$('.modal-body');if(!list||!document.querySelector('.version-list')||$('[data-action="recording-version-list"]'))return;list.insertAdjacentHTML('afterend',button('recording-version-list',t('versionRehearsals'),'Mic','','rec-version-entry'));}
 function handle(action,el){
  if(action==='versions'){queueMicrotask(appendVersionEntry);return false;}
  if(!action?.startsWith('recording-'))return false;
  const id=el?.dataset.id;
  const run=async()=>{switch(action){
   case 'recording-start':if(active){if(saving||starting)host.toast(t('busy'));else host.toggleTimer();}else await startRecording();break;
   case 'recording-cancel':pendingNavigation=null;host.closeModal();break;
   case 'recording-save-leave':{const next=pendingNavigation;pendingNavigation=null;if(await finish()){host.closeModal();next?.();}break;}
   case 'recording-manager':await openManager();break;
   case 'recording-version-list':{const c=current();await openManager({speechId:c?.s.id,versionId:c?.s.activeVersionId||c?.v.id});break;}
   case 'recording-open-saved':{const r=await store.getRecord(id);if(r){await openManager({speechId:r.speechId,versionId:r.versionId});await play(id);}break;}
   case 'recording-play':await play(id);break;
   case 'recording-text':await showText(id);break;
   case 'recording-share':await share(id);break;
   case 'recording-seek-back':if(player)player.currentTime=Math.max(0,player.currentTime-10);break;
   case 'recording-seek-forward':if(player)player.currentTime=Math.min(player.duration||Infinity,player.currentTime+10);break;
   case 'recording-select-all':document.querySelectorAll('[data-rec-select]').forEach(n=>selected.add(n.dataset.recSelect));renderLibrary();break;
   case 'recording-clear':selected.clear();renderLibrary();break;
   case 'recording-delete':askDelete([id]);break;
   case 'recording-delete-selected':askDelete([...selected]);break;
   case 'recording-delete-all':askDelete(records.filter(r=>(!manager.speechId||r.speechId===manager.speechId)&&(!manager.versionId||r.versionId===manager.versionId)).map(r=>r.id));break;
   case 'recording-delete-preparation':askDelete(records.filter(r=>r.speechId===id).map(r=>r.id));break;
   case 'recording-delete-version':askDelete(records.filter(r=>r.speechId===id&&r.versionId===el.dataset.version).map(r=>r.id));break;
   case 'recording-evict':await erase(false);break;
   case 'recording-permanent':await erase(true);break;
   case 'recording-return':await openManager(manager||{});break;
   case 'recording-sync':await sync();break;
  }};void run().catch(error=>fail(error));return true;
 }
 function onClose(){cleanupPlayer();if(host.rt.modal==='recording-library')manager=null;}
 function guardAction(action,el){if((starting||saving)&&['timer-start','timer-toggle','timer-stop','finish-rehearsal','timer-restart'].includes(action)){host.toast(t('busy'));return true;}if(!active&&!saving&&!starting)return false;if(action.startsWith('recording-')||['timer-toggle','timer-start','timer-stop','finish-rehearsal','focus'].includes(action))return false;if(['select-content-version','content-version-options','version-select','version-open','select-version','restore-version','timer-restart','memorize','memorization-open','teleprompter-open','edit','back','drive-settings','speech-menu','memo-mode','memorization-mode','memo-open','presentation-mode','mode-menu','memory-mode-menu','memory-open','memory-confirm-open','teleprompter-open'].includes(action)||action.startsWith('version-')){const attrs={...el?.dataset};return guard(()=>{const b=document.createElement('button');Object.assign(b.dataset,attrs);b.dataset.action=action;document.body.append(b);b.click();b.remove();});}return false;}
 async function start(){
  if(active||saving||starting)return;
  try{
   // Native recovery also finds audio finalized while WebView was suspended.
   if(native){for(const meta of await native.request('list')){const previous=await store.getRecord(meta.id);if(previous&&previous.status!=='deleted'&&meta.status==='ready')await store.patch(meta.id,{mime:meta.mime,bytes:meta.bytes,sha256:meta.sha256,durationMs:meta.durationMs,localAvailable:!!meta.localAvailable,status:'ready',interrupted:!!meta.interrupted});}}
   if(await store.lease(owner)){for(const row of await store.list())if(row.status==='recording'){const blob=await store.blob(row.id);if(blob?.size)await store.patch(row.id,{status:'ready',interrupted:true,durationMs:Math.max(0,(row.heartbeat||row.createdAt)-row.createdAt),bytes:blob.size,sha256:await recordingHash(blob)});else await store.patch(row.id,{status:'failed'});}await store.lease(owner,true);}
  }catch(error){console.error('Recording recovery',error);mount();return;}
  mount();if(await store.setting('autoBackup')!==false)void sync(false);
 }
 window.addEventListener('nativeBackground',()=>void interrupted());window.addEventListener('nativeMicError',()=>void interrupted());window.addEventListener('nativeRecordingInterrupted',()=>void interrupted());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void interrupted();else if(!active&&!starting)void start();});
 window.addEventListener('pagehide',()=>{if(active)void interrupted();});
 window.addEventListener('beforeunload',e=>{if(active||saving||starting){e.preventDefault();e.returnValue='';}});
 window.addEventListener('nativeDrive',()=>{if(!active&&!starting)void store.setting('autoBackup').then(v=>{if(v!==false)void sync(false);}).catch(()=>{});});
 window.addEventListener('online',()=>{void store.setting('autoBackup').then(v=>{if(v!==false)void sync(false);}).catch(()=>{});});
 document.addEventListener('click',event=>{const el=event.target.closest('[data-action]');if(el?.dataset.action==='versions')setTimeout(appendVersionEntry,0);if(el&&!el.disabled&&guardAction(el.dataset.action,el)){event.preventDefault();event.stopImmediatePropagation();}},true);
 return {start,mount,tick,handle,guard,guardAction,interceptFinish,onClose,openManager,store,getSnapshot:()=>({active:active?{...active}:null,starting,saving:!!saving}),sync};
}
