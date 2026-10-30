import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url)),qa=path.join(root,'tests/qa-output');mkdirSync(qa,{recursive:true});
const log=path.join(qa,'verification-1.0.74.log');writeFileSync(log,'');const results=[];let success=false;
const commands=['sharing/build.mjs','localization/build.mjs','protection/build.mjs','rhythms/build.mjs','enhancements/build.mjs','timing/build.mjs','rehearsal/build.mjs','memorization/build.mjs','memorization/verify-memorization.mjs','rehearsal/verify-rehearsal.mjs','rehearsal/verify-speech-browser.mjs','tests/time-mark-app.test.mjs','timing/verify-control-cascade.mjs','timing/verify-exchange.mjs','tests/enhancements-settings.test.mjs','tests/enhancements-editor.test.mjs','rhythms/verify-rhythms.mjs','rhythms/verify-rhythm-colors.mjs','sharing/verify-share-code.mjs','tests/drive-retention.test.cjs','tests/i18n.test.mjs','tests/portuguese-review.test.cjs','tests/pwa-localization.test.cjs','protection/verify-drive-core.mjs','protection/verify-drive-intelligence.mjs','protection/verify-drive-scheduling.mjs','protection/verify-drive-retention.mjs','protection/verify-ios-authorization.mjs','protection/verify-worker-authorization.mjs','protection/verify-ipad-authorization.mjs','protection/verify-cloudflare-authorization.mjs','protection/verify-host.mjs','protection/verify-content-index.mjs','protection/verify-sync-integrity.mjs','protection/verify-sync-drafts.mjs','protection/verify-sync-globals.mjs','protection/verify-backup-interval.mjs','protection/verify-backup-choices.mjs','protection/verify-backup-editor-flow.mjs','protection/verify-backup-live-flow.mjs'];
function run(command){const result=spawnSync(process.execPath,[command],{cwd:root,encoding:'utf8',maxBuffer:5000000,timeout:180000});const output=(result.stdout||'')+(result.stderr||'');appendFileSync(log,command+'\n'+output+'\n');if(result.status!==0){console.error(output);throw Error(command+' failed: '+(result.error?.message||result.status));}const checks=(output.match(/^(?:PASS|OK)\b/gm)||[]).length;results.push({command,checks});console.log('PASS '+command+(checks?' · '+checks+' verificações':''));}
const hash=name=>createHash('sha256').update(readFileSync(path.join(root,name))).digest('hex');
try{
 for(const command of commands)run(command);
 const files=['app.js','launch-gate.js','drive.css','index.html','sw.js','review-worker.js','semantic-worker.js','content-index-worker.js'],before=files.map(hash);
 for(const command of commands.filter(command=>command.endsWith('/build.mjs')))run(command);
 if(JSON.stringify(files.map(hash))!==JSON.stringify(before))throw Error('The release build must be idempotent');
 results.push({command:'build-idempotence',checks:1});console.log('PASS Compilar novamente não modifica os arquivos publicados.');
 if(process.argv.includes('--ui')){run('rhythms/verify-rhythms-ui.cjs');run('rhythms/verify-interface-1.0.65.cjs');run('protection/verify-iphone-ui.mjs');run('protection/verify-iphone-upgrade.mjs');run('protection/verify-iphone-renewal.mjs');}
 success=true;
}finally{
 const report={success,checks:results.reduce((sum,row)=>sum+row.checks,0),results,googleServices:'simulated',realIPhone:false};writeFileSync(path.join(root,'QA-drive-iphone-all-1.0.74.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({success,checks:report.checks}));
}
