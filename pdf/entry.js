import {createPdfExportUI} from './pdf-export-ui.js';
import css from './pdf-export.css';
const style=document.createElement('style');style.id='seprepare-pdf-style';style.textContent=css;document.head.append(style);
window.SePreparePdfExport={createPdfExportUI};
