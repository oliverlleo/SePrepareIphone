import {createReviewLanguages} from './review-languages-ui.js';
import css from './review-languages.css';
if(!document.getElementById('seprepare-review-language-style')){const style=document.createElement('style');style.id='seprepare-review-language-style';style.textContent=css;document.head.append(style);}
window.SePrepareReviewLanguages={createReviewLanguages};
