import {messageTextVersions} from './sharing.js';

export const APP_DOWNLOAD_URL='https://seprepareapp.com.br/baixar/';
export const CODE_MESSAGE_START='[INÍCIO DO CÓDIGO SEPREPARE]';
export const CODE_MESSAGE_END='[FIM DO CÓDIGO SEPREPARE]';
export function textShareMessage(speech,ids){return messageTextVersions(speech,ids)+'\n\n'+APP_DOWNLOAD_URL;}
export function fileShareMessage(){return 'Preparação compartilhada pelo SePrepare.\n\nAbra o arquivo .seprepare no SePrepare e confira antes de salvar. Você também pode usar o ícone de importar → Usar arquivo.\n\nBaixar ou acessar o SePrepare: '+APP_DOWNLOAD_URL;}
export function codeShareMessage(speech,code,count){
 return ['Preparação compartilhada pelo SePrepare',String(speech.title).replace(/[\r\n]+/g,' '),count+' '+(count===1?'versão':'versões'),'','Copie esta mensagem inteira. No SePrepare, toque no ícone de importar → Usar código → Colar código copiado → Conferir preparação. Depois, escolha Salvar no aparelho.','','Baixar ou acessar o SePrepare: '+APP_DOWNLOAD_URL,'',CODE_MESSAGE_START,code,CODE_MESSAGE_END].join('\n');
}
