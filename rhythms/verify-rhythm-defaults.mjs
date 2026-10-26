import assert from 'node:assert/strict';
import {rhythmLabelStarts,defaultLabelAnchor} from './rhythm-markers.js';
import {rhythmValue} from './rhythm-core.js';
const pace=rhythmValue({id:'test',name:'Enfático',ppm:140,color:'#c2944f'});
const run=(text,value)=>({text,value}),labels=(runs,global=false)=>rhythmLabelStarts(runs,global).map(v=>v.rhythm?.name||'Padrão');
assert.deepEqual(labels([run('a'),run('b')]),[]);
assert.deepEqual(labels([run('a'),run('b',pace),run('c')]),['Padrão','Enfático','Padrão']);
assert.deepEqual(labels([run('a',pace),run('b')]),['Enfático','Padrão']);
assert.deepEqual(labels([run('a'),run('b',pace)]),['Padrão','Enfático']);
assert.deepEqual(labels([run('a',pace),run('b',pace)]),['Enfático']);
assert.deepEqual(labels([run('a'),run('b',pace),run('c',pace),run('d')]),['Padrão','Enfático','Padrão']);
assert.deepEqual(labels([run('a'),run(' \n',pace)]),[]);
assert.deepEqual(labels([run('página padrão')],true),['Padrão']);
const content=[{text:'a',notes:['n']},{text:'b',value:pace}];const before=JSON.stringify(content);labels(content);assert.equal(JSON.stringify(content),before);
const doc={createTreeWalker(root){const nodes=[];function walk(e){for(const node of e.children)node.nodeType===3?nodes.push(node):walk(node)}walk(root);let n=0;return {nextNode:()=>nodes[n++]||null}}};
const el=(ignore=false)=>({nodeType:1,children:[],ownerDocument:doc,matches:()=>ignore,closest(){return ignore?this:this.parentElement?.closest()||null}});
const txt=value=>({nodeType:3,nodeValue:value});
const add=(parent,...children)=>{for(const child of children){child.previousSibling=parent.children.at(-1)||null;child.parentElement=parent;parent.children.push(child)}return parent};
{const root=el(),p=el(),t=txt('normal');add(root,add(p,t));assert.deepEqual(defaultLabelAnchor(t,root),{element:p,position:'before'})}
{const root=el(),p=el(),special=add(el(),txt('rápido')),normal=txt('normal');add(root,add(p,special,normal));assert.deepEqual(defaultLabelAnchor(normal,root),{element:special,position:'after'})}
{const root=el(),p=el(),bold=el(),normal=txt('normal');add(root,add(p,txt('rápido'),add(bold,normal)));assert.deepEqual(defaultLabelAnchor(normal,root),{element:bold,position:'before'})}
console.log('PASS: 12 verificações das transições Padrão e metadados');
