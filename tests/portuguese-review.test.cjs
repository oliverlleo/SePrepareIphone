const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=source.indexOf('var q0='),end=source.indexOf('var ec=',start);
assert(start>=0&&end>start,'Actual dictionary and local-rule engine must be identifiable');
const rules=source.slice(start,end);
assert(!rules.includes('SPLocale'),'Changing UI language must never translate proofreading replacements');
for(const language of ['pt-BR','en','es','ja']){
 const context={language};vm.runInNewContext(rules+';this.matches=Ql("discurço voçe nao");',context);
 assert.deepEqual(Array.from(context.matches,m=>m.replacements[0]),['discurso','você','não']);
}
console.log('PASS Portuguese corrections remain in Portuguese in all four UI languages.');
