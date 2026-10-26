export const normalizeSettingText=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const concepts={
 recover:['recuperar','recuperacao','restaurar','restauracao','backup','copia','drive','recover','recovery','restore','restaurar','recuperacion','respaldo','復元','回復','バックアップ'],
 speed:['velocidade','ritmo','ppm','rapido','lento','speed','pace','rate','velocidad','rapidez','速度','ペース'],
 voice:['voz','vozes','audio','som','falar','ouvir','voice','voices','sound','speech','listen','voces','sonido','escuchar','音声','声','読み上げ'],
 language:['idioma','lingua','linguagem','language','languages','ingles','portugues','espanhol','japones','english','spanish','japanese','言語','英語','日本語'],
 spelling:['ortografia','revisao','revisar','correcao','corretor','dicionario','spelling','review','proofreading','correction','dictionary','ortografia','revision','correccion','diccionario','校正','辞書','スペル'],
 appearance:['tema','aparencia','escuro','claro','cor','theme','appearance','dark','light','tema','apariencia','oscuro','claro','テーマ','外観','ダーク','ライト'],
 notification:['notificacao','notificacoes','lembrete','lembretes','alarme','alerta','horario','notification','notifications','reminder','alarm','schedule','notificaciones','recordatorio','aviso','通知','リマインダー','アラーム'],
 trash:['lixeira','excluido','apagado','deletado','trash','deleted','bin','papelera','eliminado','borrado','ごみ箱','削除'],
 privacy:['privacidade','termos','seguranca','privacy','terms','security','privacidad','terminos','seguridad','プライバシー','利用規約'],
 help:['ajuda','guia','tutorial','aprender','help','guide','tutorial','ayuda','guia','ヘルプ','ガイド'],
 support:['apoiar','apoio','contribuir','doar','support','donate','contribute','apoyar','donar','支援','寄付'],
 about:['sobre','versao','licenca','creditos','about','version','license','credits','acerca','licencia','バージョン','ライセンス','情報']
};
export function searchSettings(entries,query){
 const normalized=normalizeSettingText(query);if(!normalized)return entries.filter(entry=>!entry.parent);
 const tokens=normalized.split(' '),wanted=new Set(Object.entries(concepts).filter(([,words])=>words.some(word=>normalizeSettingText(word)===normalized||tokens.some(token=>normalizeSettingText(word)===token))).map(([key])=>key));
 return entries.map((entry,order)=>{
  const title=normalizeSettingText(entry.title),index=normalizeSettingText([entry.title,entry.category,entry.keywords||'',entry.parentTitle||''].join(' '));
  const direct=tokens.every(token=>index.includes(token)),semantic=entry.concepts?.some(concept=>wanted.has(concept));
  if(!direct&&!semantic)return null;
  // Multi-word queries must still identify a concrete setting, not only a broad concept.
  if(tokens.length>1&&!direct&&!index.includes(normalized)&&!tokens.every(token=>index.includes(token)||Object.entries(concepts).some(([concept,words])=>entry.concepts?.includes(concept)&&words.some(word=>normalizeSettingText(word)===token))))return null;
  const score=(title===normalized?100:title.includes(normalized)?65:direct?40:20)+(!entry.parent?5:0);
  return {entry,score,order};
 }).filter(Boolean).sort((a,b)=>b.score-a.score||a.order-b.order).map(row=>row.entry);
}
