import css from './memorization.css';
import {createMemorizationUI,memoryBrainIcon} from './memorization-ui.js';
import {validateMemorization,copyMemorization,mergeMemorization,mergeDocumentMemorization} from './memorization-data.js';
import {getLocalSemanticWorker} from './semantic-service.js';
if(!document.getElementById('seprepare-memorization-style')){const style=document.createElement('style');style.id='seprepare-memorization-style';style.textContent=css;document.head.append(style);}
window.SePrepareMemorization={createMemorizationUI,memoryBrainIcon,validateMemorization,copyMemorization,mergeMemorization,mergeDocumentMemorization,getLocalSemanticWorker};
