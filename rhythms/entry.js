import {createRhythmUI} from './rhythm-ui.js';
import {mountEditorFooter} from './editor-footer.js';
import {parseRhythm,validateRhythmCatalog,visitRhythmOps,receiveRhythms} from './rhythm-core.js';
import css from './rhythm.css';
const style=document.createElement('style');style.id='seprepare-rhythms-style';style.textContent=css;document.head.append(style);
window.SePrepareRhythms={createRhythmUI,mountEditorFooter,parseRhythm,receiveRhythms,validateState(value){
 validateRhythmCatalog(value?.settings?.rhythms);
 for(const speech of value?.speeches||[])visitRhythmOps(speech,op=>{if(op.attributes?.['speech-rhythm']!==undefined&&!parseRhythm(op.attributes['speech-rhythm']))throw Error('Marcação de ritmo inválida.');});
}};
