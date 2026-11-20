import {t as translateUI,tr as formatUI,h as markupUI,html as htmlUI,uiLocale,setLanguage,normalizeLanguage} from '../localization/shared.js';
import {messageTextVersions} from './sharing.js';
import {shareUxText} from './share-ux-i18n.js';

export const APP_DOWNLOAD_URL='https://seprepareapp.com.br/baixar/';
export const CODE_MESSAGE_START='[INÍCIO DO CÓDIGO SEPREPARE]';
export const CODE_MESSAGE_END='[FIM DO CÓDIGO SEPREPARE]';
export function textShareMessage(speech,ids){return messageTextVersions(speech,ids)+'\n\n'+APP_DOWNLOAD_URL;}
const instruction=key=>shareUxText(key).replace('{import}',translateUI('Importar preparação')).replace('{code}',translateUI('Usar código')).replace('{file}',translateUI('Usar arquivo')).replace('{preview}',translateUI('Conferir preparação'));
export function fileShareMessage(){return translateUI('Preparação compartilhada pelo SePrepare')+' (.seprepare)\n\n'+instruction('fileInstruction')+'\n\n'+APP_DOWNLOAD_URL;}
export function codeShareMessage(speech,code,count){
 return [translateUI('Preparação compartilhada pelo SePrepare'),String(speech.title).replace(/[\r\n]+/g,' '),count+' '+(count===1?translateUI('versão'):translateUI('versões')),'',instruction('codeInstruction'),'',APP_DOWNLOAD_URL,'',CODE_MESSAGE_START,code,CODE_MESSAGE_END].join('\n');
}
