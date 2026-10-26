// Share the guarded runtime already embedded in app.js; no second catalog.
const runtime=()=>globalThis.window?.SPLocale;
export const t=value=>runtime()?.t(value)??String(value??'');
export const tr=(parts,...values)=>runtime()?.tr(parts,...values)??parts.reduce((text,part,index)=>text+part+(index<values.length?values[index]:''),'');
export const h=(parts,...values)=>runtime()?.h(parts,...values)??parts.reduce((text,part,index)=>text+part+(index<values.length?values[index]:''),'');
export const html=value=>runtime()?.html(value)??value;
export const uiLocale=()=>runtime()?.uiLocale()??'pt-BR';
export const normalizeLanguage=value=>runtime()?.normalizeLanguage(value)??(['en','es','ja'].includes(value)?value:'pt-BR');
export const setLanguage=value=>runtime()?.setLanguage(value);
export const systemMessage=value=>runtime()?.systemMessage(value)??String(value??'');
