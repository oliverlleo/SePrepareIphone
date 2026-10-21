import assert from 'node:assert/strict';
import {catalogs} from '../localization/i18n-catalogs.js';
import {LANGUAGES,normalizeLanguage,setLanguage,t,tr,h,html,uiLocale,systemMessage} from '../localization/i18n.js';
import {validState,newSpeech,newPart,ensureVersions} from '../sharing/core.js';
const keys=Object.keys(catalogs.en);
assert(keys.length>1600);
for(const lang of ['en','es','ja']){
 assert.deepEqual(Object.keys(catalogs[lang]),keys);
 for(const key of keys){assert.equal(typeof catalogs[lang][key],'string');assert(catalogs[lang][key].trim());assert.deepEqual((key.match(/\{\d+\}/g)||[]).sort(),(catalogs[lang][key].match(/\{\d+\}/g)||[]).sort(),lang+': '+key);}
}
assert.deepEqual(LANGUAGES,['pt-BR','en','es','ja']);
for(const input of [undefined,null,'de','pt-PT','__proto__'])assert.equal(normalizeLanguage(input),'pt-BR');
const personal='<b>Salvar</b> Ajustes Anotar Caderno 日本語';
for(const [lang,save,locale]of [['en','Save','en-US'],['es','Guardar','es-ES'],['ja','保存','ja-JP']]){
 setLanguage(lang);assert.equal(uiLocale(),locale);assert.equal(t('Salvar'),save);assert.equal(t(' Salvar '),' '+save+' ');
 assert.equal(h`<b>Salvar</b><div>${personal}</div>`,`<b>${save}</b><div>${personal}</div>`);
 assert.equal(h`<h3>${'<svg></svg>'}Notificações no iPhone</h3>`,`<h3><svg></svg>${t('Notificações no iPhone')}</h3>`);
 assert.equal(html('<button aria-label="Salvar">Salvar</button>'),`<button aria-label="${save}">${save}</button>`);
 assert.equal(h`<span>${personal}</span>`,`<span>${personal}</span>`);
}
setLanguage('ja');assert.equal(tr`Página ${2} de ${3}`,'3ページ中 2ページ');
setLanguage('en');const error=systemMessage('Não foi possível abrir o caderno.');setLanguage('ja');assert.equal(systemMessage(error),t('Não foi possível abrir o caderno.'));
setLanguage('pt-BR');const speech=newSpeech('category'),part=newPart('category');speech.title='Salvar';speech.delta={ops:[{insert:'Anotar Ajustes Caderno\n',attributes:{bold:true,color:'#764f8a',background:'#f8e4a1'}}]};ensureVersions(speech);speech.versions[0].name='Revisar português';part.participants=[{id:'p1',name:'Salvar'},{id:'p2',name:'Anotar'}];part.myParticipantId='p1';part.delta={ops:[{insert:'Fala em português\n',attributes:{speaker:'p1'}}]};ensureVersions(part);
const data=validState({schema:1,speeches:[speech,part],categories:[{id:'category',name:'Ajustes',color:'#637765',icon:'BookOpen'}],settings:{language:'en'}}),before=JSON.stringify(data.speeches),categories=JSON.stringify(data.categories);
for(const lang of LANGUAGES){setLanguage(lang);assert.equal(JSON.stringify(validState(structuredClone(data)).speeches),before);assert.equal(JSON.stringify(data.categories),categories);}
setLanguage('pt-BR');
console.log(`PASS Four locales; ${keys.length} messages per language; parameters, opaque user content, legacy data and errors preserved.`);
