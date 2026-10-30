import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parse} from '../sharing/node_modules/acorn/dist/acorn.mjs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\/\* SEPREPARE MEMORIZATION ([A-Z]+) START \*\/[\s\S]*?\/\* SEPREPARE MEMORIZATION \1 END \*\//g,'').replace(/\/\* SEPREPARE RHYTHMS ([A-Z]+) START \*\/[\s\S]*?\/\* SEPREPARE RHYTHMS \1 END \*\//g,'').replace(/\/\* SEPREPARE PROTECTION ([A-Z]+) START \*\/[\s\S]*?\/\* SEPREPARE PROTECTION \1 END \*\//g,''),contract=JSON.parse(readFileSync(new URL('./iphone-host-contract.json',import.meta.url),'utf8')),nodes=[];
const bundleRanges=[...source.matchAll(/\/\* SEPREPARE [A-Z]+ (BUNDLE|CODEC) START \*\/[\s\S]*?\/\* SEPREPARE [A-Z]+ \1 END \*\//g)].map(m=>[m.index,m.index+m[0].length]);
function walk(node){if(!node||typeof node!=='object'||node.type&&bundleRanges.some(([a,b])=>node.start>=a&&node.end<=b))return;if(node.type==='FunctionDeclaration')nodes.push(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}}
walk(parse(source,{ecmaVersion:'latest'}));
for(const {name,purpose,sha256}of contract.functions){const found=nodes.filter(n=>n.id.name===name&&(name!=='le'||source.slice(n.start,n.end).includes('Yt.saveState')));assert.equal(found.length,1,name);const node=found[0];assert.equal(createHash('sha256').update(source.slice(node.start,node.end).replaceAll('\r\n','\n')).digest('hex'),sha256,purpose+' precisa permanecer íntegra');console.log('PASS Base iPhone preservada: '+purpose);}
assert(source.includes('window.SePrepareDriveProtection.createBridge'));
assert(source.includes('window.SePrepareDriveProtection.createUI'));
assert(source.includes('Ml.cardIndicator(t)'));
assert(source.includes('setting-card drive-backup-setting'));
console.log('PASS Os pontos de integração usam a proteção nova, mantendo o editor e a memória originais.');
