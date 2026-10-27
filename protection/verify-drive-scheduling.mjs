import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {fixture,until,DRIVE_KEY} from './drive-web-fixture.mjs';
import {driveIndex} from './drive-core.js';
import {backupDocumentHash} from './drive-backup-state.js';
import {createDriveReceiptCache,driveRetryDelay,retainedDriveCopies,DRIVE_BACKUP_GAP} from './browser-drive-state.js';
const checks=[];const pass=name=>{checks.push(name);console.log('PASS',name);};
{
 const f=fixture();let release;f.hooks.account=()=>new Promise(resolve=>{release=resolve;});const linking=f.action('connect');await until(()=>!!release);
 f.getState().speeches[0].title='Edição enquanto o Google responde';await f.save();
 const stored=f.values.get(DRIVE_KEY);if(stored){const record=JSON.parse(stored);assert(!record.data.connected||record.data.email);}
 const reopened=fixture({values:new Map(f.values)});assert.equal(reopened.status().errorCode,'');assert.equal(reopened.status().connected,false);reopened.dispose();
 release();const result=await linking;assert(!result.error,result.error);assert.equal(f.status().email,'pessoa@example.test');f.dispose();
 pass('Interromper a primeira conexão enquanto o usuário edita não grava uma conta incompleta nem corrompe a próxima abertura');
}
{
 const f=fixture();await f.action('connect');assert(f.status().autoBackup&&f.status().autoRead);assert(f.status().backupPending);assert.equal(f.status().nextBackupAt,f.now());assert.equal(f.oauth.requests[0].options.scope,'https://www.googleapis.com/auth/drive.appdata');assert(!('frequencyDays' in f.status()));
 pass('Novo vínculo liga os dois automatismos e pede somente acesso privado do Drive, sem frequência por dias');
 assert(!(await f.run()).error);assert.equal(f.uploads(),1);assert(!f.status().backupPending);assert.equal(f.status().nextBackupAt,0);
 pass('Primeira cópia automática não recebe espera artificial de dez segundos');
 const baseline=f.now();f.getState().speeches[0].updatedAt+=300;await f.save();assert(!f.status().backupPending);f.advance(10000);assert((await f.run()).skipped);assert.equal(f.uploads(),1);
 pass('Salvar sem mudança real ou alterar relógios internos não cria cópia duplicada');
 f.getState().speeches[0].title='Título novo';await f.save();const due=f.status().nextBackupAt;f.advance(5000);f.getState().speeches[0].title='Título final';await f.save();assert.equal(f.status().nextBackupAt,due);f.advance(5000);await f.run();assert.equal(f.uploads(),2);assert(!f.status().backupPending);assert(f.now()>baseline);
 pass('Alterações próximas usam o prazo da primeira mudança e enviam somente o conteúdo final');
 const index=JSON.parse(f.drive.driveBackupIndex());assert.equal(index.documents.prepared,await backupDocumentHash(f.getState().speeches[0],f.getState()));assert.equal(index.account,f.status().email);
 pass('Recibo da cópia confirmada fornece a nuvem exata do conteúdo e da conta');
 const calls=f.calls.length;f.advance(900001);await f.action('check');assert.equal(JSON.parse(f.drive.drivePending()).state,undefined);assert.equal(f.calls.length,calls+1);assert(!f.status().needsReview);
 pass('Verificar a cópia enviada pelo próprio navegador não baixa nem restaura novamente');f.dispose();
}
{
 const f=fixture();await f.action('connect');await f.send();f.getState().speeches[0].title='Mudança offline';await f.save();f.advance(10000);f.faults.lists=1;assert((await f.run()).error);assert(f.status().backupPending);const retry=f.status().backupRetryAt;assert.equal(retry,f.now()+10000);await f.save();assert.equal(f.status().backupRetryAt,retry);f.advance(9999);assert((await f.run()).skipped);f.advance(1);await f.run();assert.equal(f.uploads(),2);assert.equal(f.status().backupFailures,0);assert.equal(f.status().error,'');
 assert.equal(driveRetryDelay(1),10000);assert.equal(driveRetryDelay(2),20000);assert.equal(driveRetryDelay(20),900000);
 pass('Falha real conserva a mudança e repete com backoff de dez segundos até quinze minutos');f.dispose();
}
{
 const f=fixture();await f.action('connect');await f.send();f.getState().speeches[0].title='Backup manual interrompido';await f.save();f.faults.uploads=1;assert((await f.send()).error);assert.equal(f.status().backupRetryAt,f.now()+10000);f.advance(10000);await f.run();assert.equal(f.remote.length,2);assert(!f.status().backupPending);
 pass('Falha no envio manual entra na mesma fila automática, sem esperar dias');f.dispose();
}
{
 const f=fixture();await f.action('connect');await f.send();let edited=false;
 f.getState().speeches[0].title='Capturado para upload';await f.save();f.advance(10000);f.hooks.upload=async()=>{if(!edited){edited=true;f.getState().speeches[0].title='Editado durante upload';await f.save();}};await f.run();
 assert(f.status().backupPending);const old=JSON.parse(f.drive.driveBackupIndex());assert.notEqual(old.documents.prepared,await backupDocumentHash(f.getState().speeches[0],f.getState()));f.advance(10000);await f.run();assert(!f.status().backupPending);assert.equal(f.uploads(),3);
 pass('Edição durante a transferência não fica verde com o recibo antigo e recebe outra cópia');f.dispose();
}
{
 const f=fixture();await f.action('connect');let release;f.hooks.cleanup=()=>new Promise(resolve=>{release=resolve;});const sending=f.send();await until(()=>!!release);
 assert(f.status().busy);assert(f.events.some(event=>event.kind==='backup-confirmed'));assert(JSON.parse(f.drive.driveBackupIndex()).documents.prepared);release();await sending;
 pass('Confirmação e índice chegam à tela antes de a limpeza do histórico terminar');f.dispose();
}
{
 const f=fixture();await f.action('connect');await f.send();const authorizations=f.oauth.requests.length;f.getState().speeches[0].title='Sessão expirada';await f.save();f.advance(10000);f.faults.unauthorized=1;const start=f.events.length;await f.run();
 assert.equal(f.oauth.requests.length,authorizations+1);assert.deepEqual(f.oauth.requests.at(-1).override,{prompt:'none',login_hint:'pessoa@example.test'});assert(!f.status().needsAuthorization);assert(!f.status().needsReconnect);assert.equal(f.uploads(),2);assert(f.events.slice(start).every(event=>!event.error));
 pass('HTTP 401 renova silenciosamente a conta vinculada e repete sem erro intermediário de desconexão');f.dispose();
}
{
 const f=fixture();await f.action('connect');await f.send();f.getState().speeches[0].title='Aguarda interação';await f.save();f.advance(10000);f.oauth.silentError=true;f.faults.unauthorized=1;await f.run();assert(f.status().connected&&f.status().needsAuthorization&&!f.status().needsReconnect);assert.equal(f.status().error,'');const before=f.oauth.requests.length;f.win.dispatchEvent(new Event('focus'));await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.oauth.requests.length,before);f.doc.dispatchEvent(new Event('pointerdown'));await until(()=>!f.status().needsAuthorization&&!f.status().busy);assert.equal(f.oauth.requests.at(-1).override.prompt,'');assert.equal(f.oauth.requests.at(-1).override.login_hint,'pessoa@example.test');
 pass('Quando o Google exige interação, o primeiro gesto retoma a conta sem seletor nem repetição de janelas');f.dispose();
}
{
 const f=fixture();await f.action('connect');const started=f.now();await f.send();await f.action('list');assert.equal(DRIVE_BACKUP_GAP,10000);assert(f.calls.length>=5);assert(f.calls.every(call=>call.at===started));assert.deepEqual(f.waits,[]);
 pass('Consultas, envio, confirmação e limpeza do mesmo backup não têm pausa fixa');f.dispose();
}
{
 const f=fixture();await f.action('connect');await f.send();f.doc.hasFocus=()=>false;f.getState().speeches[0].title='Janela visível sem foco';await f.save();f.advance(10000);await f.run();assert.equal(f.uploads(),2);f.doc.hidden=true;f.getState().speeches[0].title='Aguarda aba visível';await f.save();f.advance(10000);assert((await f.run()).skipped);f.doc.hidden=false;await f.run();assert.equal(f.uploads(),3);
 pass('Janela visível sem foco continua protegida; aba suspensa conserva pendência e retoma ao voltar');f.dispose();
}
{
 const f=fixture();await f.action('connect');await f.send();f.getState().speeches[0].title='Proteção desligada';await f.action('auto-backup','false');await f.save();f.advance(10000);assert((await f.run()).skipped);assert(f.status().backupPending);await f.action('auto-read','false');assert(!f.status().autoBackup&&!f.status().autoRead);assert(!JSON.stringify([...f.values]).includes('TEST_MEMORY_TOKEN_'));f.dispose();
 const reopened=fixture({values:f.values});await until(()=>!reopened.status().authorizationPending);assert(!reopened.status().autoBackup&&!reopened.status().autoRead);reopened.dispose();
 pass('Preferências explicitamente desligadas sobrevivem à reabertura e nenhum token é persistido');
}
{
 const idb=new IDBFactory(),cache=createDriveReceiptCache(idb),f=fixture({cache});await f.action('connect');await f.send();const source=JSON.parse(f.drive.driveRestoreBase());assert(source.state.includes('Conteúdo preservado'));assert(!f.values.get(DRIVE_KEY).includes('Conteúdo preservado'));await cache.load(f.status().email);f.dispose();const reopened=fixture({values:f.values,cache});await until(()=>JSON.parse(reopened.drive.driveRestoreBase()).id===source.id);assert.equal(JSON.parse(reopened.drive.driveRestoreBase()).state,source.state);reopened.dispose();
 pass('Referência completa usa IndexedDB, persiste na PWA e não duplica os discursos nas preferências pequenas');
}
{
 const idb=new IDBFactory(),cache=createDriveReceiptCache(idb),f=fixture({cache});await f.action('connect');await f.send();const saved=JSON.parse(f.drive.driveRestoreBase());await cache.save({...saved,state:saved.state.replace('Conteúdo','Alterado')});f.dispose();const reopened=fixture({values:f.values,cache});await until(()=>!reopened.status().authorizationPending);await new Promise(resolve=>setTimeout(resolve,10));assert.equal(JSON.parse(reopened.drive.driveRestoreBase()).state,undefined);reopened.dispose();
 pass('Cache de referência corrompido é ignorado; não vira base falsa para combinar textos');
}
{
 const f=fixture();await f.action('connect');await f.send();const changed=structuredClone(f.getState());changed.speeches[0].title='Outro aparelho';await f.addRemote('remote-new',JSON.stringify(changed));f.advance(900001);const incoming=(await f.action('check')).payload;assert.equal(incoming.id,'remote-new');assert(f.status().needsReview);assert.equal(f.uploads(),1);
 const local=await driveIndex(f.getState()),remote=await driveIndex(changed);assert(!f.drive.driveCompleteRead(JSON.stringify({id:incoming.id,account:'wrong@example.test',outcome:'current',local,remote})));assert(f.status().needsReview);
 pass('Cópia realmente nova exige análise antes de enviar e uma conta diferente não pode aprová-la');f.dispose();
}
{
 const newest=1800000000000,files=[['latest',0],['burst',10000],['hour',3600000],['day',86400000],['week',604800000]].map(([id,age])=>({id,createdTime:new Date(newest-age).toISOString(),appProperties:{seprepareBackup:'1'}}));const result=retainedDriveCopies(files,'latest');assert.deepEqual([...result.kept].sort(),['day','hour','latest','week']);assert.deepEqual(result.remove.map(row=>row.id),['burst']);
 pass('Edições rápidas preservam quatro pontos úteis de hora, dia e semana');
}
{
 const f=fixture();await f.action('connect');await f.send();f.getState().speeches[0].title='Recusa persistente';await f.save();f.advance(10000);f.faults.unauthorized=2;await f.run();assert(f.status().backupBlocked&&f.status().needsReconnect&&f.status().connected);const count=f.oauth.requests.length;f.advance(60000);f.tick();await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.oauth.requests.length,count);await f.action('connect');assert(!f.status().backupBlocked);f.dispose();
 pass('Recusa persistente depois da renovação não repete autorizações sem limite; autorização válida libera a fila');
}
{
 const f=fixture({linked:true,canWrite:()=>false});await f.save();f.advance(30000);f.tick();assert((await f.run()).skipped);assert.equal(f.calls.length,0);assert.equal(f.oauth.requests.length,0);assert(f.status().readOnly);assert.equal((await f.action('connect')).errorCode,'storage');assert(!f.drive.drivePrepareRestore());assert(!f.drive.driveTakeOffer());f.dispose();
 pass('Outra aba em modo de leitura não agenda cópias nem autorizações e não altera o Drive compartilhado');
}
{
 const f=fixture();await f.action('connect');await f.send();const old=f.remote[0];old.createdTime=new Date(f.now()-86400000).toISOString();f.getState().speeches[0].title='Novo texto local';await f.save();f.advance(10000);
 f.hooks.upload=async()=>{const other=structuredClone(f.getState());other.speeches[0].title='Texto concorrente preservado';await f.addRemote('concurrent-backup',JSON.stringify(other));};await f.run();assert(f.remote.some(row=>row.id==='concurrent-backup'));assert(f.remote.length<=4);f.dispose();
 const rows=[0,1,2,3,4].map(index=>({id:'concurrent-'+index,createdTime:new Date(1800000000000-index).toISOString(),appProperties:{seprepareBackup:'1'}}));assert.throws(()=>retainedDriveCopies(rows,'concurrent-0',rows.slice(1).map(row=>row.id)));
 pass('Cópia concorrente não conferida é preservada; mais de quatro cópias protegidas adiam toda exclusão');
}
{
 const f=fixture();await f.action('connect');await f.send();f.getState().speeches[0].title='Mudança antes de timeout';await f.save();f.advance(10000);f.faults.abort=true;await f.run();assert.equal(f.status().errorCode,'network');assert(!f.status().backupBlocked);assert.equal(f.status().backupRetryAt,f.now()+10000);f.dispose();
 pass('Timeout DOMException é uma falha transitória de rede e não um bloqueio permanente');
}
{
 const f=fixture();f.oauth.hold=true;const pending=f.action('connect');await until(()=>[...f.scheduled.values()].some(item=>item.delay===30000));[...f.scheduled.values()].find(item=>item.delay===30000).fn();await pending;assert(!f.status().busy&&!f.status().connected);f.oauth.hold=false;assert.equal((await f.action('connect')).error,'');assert(f.status().connected);f.dispose();
 pass('Resposta ausente do Google libera a interface após timeout e permite nova autorização');
}
{
 const f=fixture();await f.action('connect');await f.send();const stored=JSON.parse(f.values.get(DRIVE_KEY));stored.confirmation.documents={prepared:'corrupted'};stored.baseline={local:null,remote:null};f.values.set(DRIVE_KEY,JSON.stringify(stored));f.dispose();const reopened=fixture({values:f.values});await until(()=>!reopened.status().authorizationPending);assert(reopened.status().connected);assert(!reopened.status().needsReconnect);assert.equal(reopened.status().email,'pessoa@example.test');reopened.dispose();
 pass('Recibo ou referência danificada não transforma uma conta vinculada em desconectada');
}
console.log('TOTAL',checks.length,'verificações do agendamento e recibos web passaram.');
