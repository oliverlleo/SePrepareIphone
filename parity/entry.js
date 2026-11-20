import {createEditorRuntime} from './runtime.js';
import {openAgendaDate,readAgendaDate,openLocalCopies} from './apple-sheets.js';
import css from './editor.css';
const style=document.createElement('style');style.dataset.seprepare='editor-protection';style.textContent=css;document.head.append(style);
window.SePrepareParity={createEditorRuntime,openAgendaDate,readAgendaDate,openLocalCopies};
