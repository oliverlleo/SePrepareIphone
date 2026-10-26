import {modalityAliases} from './modality-labels.js';
import {catalogs} from './i18n-catalogs.js';
// UI-only localization. Document content is always an opaque interpolation.
export const LANGUAGES=Object.freeze(['pt-BR','en','es','ja']);
export const normalizeLanguage=value=>LANGUAGES.includes(value)?value:'pt-BR';
let language='pt-BR';
try{if(typeof localStorage!=='undefined')language=normalizeLanguage(localStorage.getItem('seprepare-ui-language'));}catch{}
if(typeof window!=='undefined')window.addEventListener('seprepare:languagechange',event=>{language=normalizeLanguage(event.detail);if(typeof document!=='undefined')document.documentElement.lang=uiLocale();});
export const uiLocale=()=>({en:'en-US',es:'es-ES',ja:'ja-JP'}[language]||'pt-BR');
export function setLanguage(value){const previous=language;language=normalizeLanguage(value);if(typeof document!=='undefined')document.documentElement.lang=uiLocale();try{if(typeof localStorage!=='undefined')localStorage.setItem('seprepare-ui-language',language);}catch{}if(previous!==language&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('seprepare:languagechange',{detail:language}));return language;}
export const isUntitled=value=>['Discurso sem título','Parte sem título','Demonstração sem título'].some(key=>value===key||Object.values(catalogs).some(catalog=>catalog[key]===value));
const splitWhitespace=value=>{const match=/^(\s*)([\s\S]*?)(\s*)$/.exec(value);return [match[1],match[2],match[3]];};
const templates=new WeakMap();
export function t(value){
 const source=String(value??'');
 const [before,key,after]=splitWhitespace(source),label=modalityAliases[key]||key,translated=language==='pt-BR'?label:catalogs[language]?.[label]??catalogs[language]?.[key];
 return before+(translated===undefined?label:translated)+after;
}
export function tr(strings,...values){
 const source=strings.reduce((all,part,i)=>all+part+(i<values.length?'{'+i+'}':''),'');
 return t(source).replace(/\{(\d+)\}/g,(match,index)=>index<values.length?String(values[index]??''):match);
}
function translatePiece(value){
 const markers=[];const source=value.replace(/\uE000(\d+)\uE001/g,(_,index)=>'{'+(markers.push(index)-1)+'}');
 let translated=t(source);
 if(translated===source){const parts=/^((?:\s*\{\d+\})*\s*)([\s\S]*?)(\s*(?:\{\d+\}\s*)*)$/.exec(source);if(parts?.[2])translated=parts[1]+t(parts[2])+parts[3];}
 return translated.replace(/\{(\d+)\}/g,(match,index)=>index<markers.length?'\uE000'+markers[index]+'\uE001':match);
}
export function html(source){
 return String(source).replace(/\b(title|placeholder|aria-label|alt)="([^"]*)"/g,(_,name,value)=>name+'="'+translatePiece(value)+'"').split(/(<[^>]*>)/g).map(piece=>piece.startsWith('<')?piece:translatePiece(piece)).join('');
}
export function h(strings,...values){
 let perLocale=templates.get(strings);if(!perLocale){perLocale=new Map();templates.set(strings,perLocale);}
 let compiled=perLocale.get(language);
 if(compiled===undefined){compiled=html(strings.reduce((all,part,i)=>all+part+(i<values.length?'\uE000'+i+'\uE001':''),''));perLocale.set(language,compiled);}
 return compiled.replace(/\uE000(\d+)\uE001/g,(_,index)=>String(values[index]??''));
}
let patterns,reverseMessages;
// Native/worker errors are system-owned. Values embedded in those messages are kept verbatim.
export function systemMessage(value){
 if(!reverseMessages){reverseMessages=new Map();for(const catalog of Object.values(catalogs))for(const [key,text]of Object.entries(catalog))if(text!==key&&!reverseMessages.has(text))reverseMessages.set(text,key);}
 value=reverseMessages.get(String(value))??value;
 const direct=t(value);if(direct!==value||language==='pt-BR')return direct;
 if(!patterns){patterns=Object.keys(catalogs.en).filter(key=>/\{\d+\}/.test(key)).map(key=>{
  const indexes=[];const expression=key.split(/(\{\d+\})/g).map(part=>/^\{\d+\}$/.test(part)?(indexes.push(Number(part.slice(1,-1))),'([\\s\\S]*?)'):part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('');return {key,indexes,regex:new RegExp('^'+expression+'$')};
 });}
 for(const {key,indexes,regex}of patterns){const match=regex.exec(String(value));if(match){const values={};indexes.forEach((index,i)=>values[index]=match[i+1]);return t(key).replace(/\{(\d+)\}/g,(_,index)=>values[index]??'');}}
 return direct;
}
