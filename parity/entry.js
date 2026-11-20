import {createEditorRuntime} from './runtime.js';
import css from './editor.css';
const style=document.createElement('style');style.dataset.seprepare='editor-protection';style.textContent=css;document.head.append(style);
window.SePrepareParity={createEditorRuntime};
