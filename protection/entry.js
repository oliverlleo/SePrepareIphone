import {pruneRedundantCheckpoints} from './editor-checkpoints.js';
import {mergeImportedMetadata} from './import-metadata.js';
import {editorDelta} from './editor-snapshot.js';
import {createDeletionLedger} from './sync-deletions.js';
import {currentChangeOrigin,withChangeOrigin} from './change-origin.js';
import {createBrowserDrive} from './browser-drive.js';
import {createDriveUI} from './drive-ui.js';
import {createIosAuthorization} from './ios-authorization.js';
const LEGACY_KEY='seprepare-web-drive-v1',KEY='seprepare-drive-web-v1';
function migrateLegacy(storage){
 if(storage.getItem(KEY))return;
 const raw=storage.getItem(LEGACY_KEY);if(!raw)return;
 const old=JSON.parse(raw);if(!old||typeof old!=='object'||old.connected&&!old.email)throw Error('Preferências anteriores do Drive inválidas.');
 let baseline=null,pending=null;
 try{baseline=JSON.parse(storage.getItem('seprepare-web-drive-baseline-v1')||'null');}catch{}
 try{pending=JSON.parse(storage.getItem('seprepare-web-drive-pending-v1')||'null');}catch{}
 storage.setItem(KEY,JSON.stringify({version:1,data:old,baseline,pending}));
 // The original account, preferences and recovery remain intact during migration.
}
export function createBridge(options){
 try{migrateLegacy(localStorage);}catch{/* The controller reports malformed records without touching notebook storage. */}
 let bridge;const authorization=options.environment?.authorization||createIosAuthorization({onChange:()=>bridge?.driveAuthorizationChanged()});
 bridge=createBrowserDrive({...options,environment:{...options.environment,authorization}});
 void authorization.prepare?.().catch(()=>{});
 window.addEventListener('online',()=>{void authorization.prepare?.(true).catch(()=>{});});
 window.addEventListener('pageshow',()=>{void authorization.prepare?.().catch(()=>{});});
 window.addEventListener('focus',()=>{void authorization.prepare?.().catch(()=>{});});
 window.addEventListener('seprepare:ready',()=>{bridge.preloadGis();bridge.driveResume();void bridge.driveLocalSaved();void authorization.prepare?.().catch(()=>{});});
 return bridge;
}
const paths={
 CloudCheck:'<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m8 17 3 3 6-6"/>',
 CloudUpload:'<path d="M12 13v8m-4-4 4-4 4 4"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>',
 CloudAlert:'<path d="M12 12v4m0 4h.01"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>'
};
export function createUI(config){
 const original=config.icon;
 return createDriveUI({...config,icon:(name,...args)=>paths[name]?'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>':original(name,...args)});
}
window.SePrepareDriveProtection={createBridge,createUI,mergeImportedMetadata,pruneRedundantCheckpoints,createDeletionLedger,currentChangeOrigin,withChangeOrigin,editorDelta};
