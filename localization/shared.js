// The sharing bundle reuses the app's runtime, including when it is loaded
// before the guarded bootstrap. Pure codec tests default to Portuguese in Node.
const locale=()=>globalThis.SPLocale;
const interpolate=(strings,values)=>strings.reduce((text,part,i)=>text+part+(i<values.length?String(values[i]??''):''),'');
export const t=value=>locale()?.t(value)??value;
export const tr=(strings,...values)=>locale()?.tr(strings,...values)??interpolate(strings,values);
export const h=(strings,...values)=>locale()?.h(strings,...values)??interpolate(strings,values);
export const html=value=>locale()?.html(value)??value;
export const uiLocale=()=>locale()?.uiLocale()??'pt-BR';
export const systemMessage=value=>locale()?.systemMessage(value)??value;
