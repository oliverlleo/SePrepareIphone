import assert from'node:assert/strict';import fs from'node:fs';import{JSDOM,VirtualConsole}from'../qa/time-dom/node_modules/jsdom/lib/api.js';
const root=new URL('../',import.meta.url),html=fs.readFileSync(new URL('../tests/qa-output/reader-layout.html',import.meta.url),'utf8'),files=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m=>m[1]);
const inline=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>'<style>'+m[1]+'</style>').join('');
const styles=files.map(name=>'<style>'+fs.readFileSync(new URL(name.replace(/^\//,''),root),'utf8')+'</style>').join('')+inline;const vc=new VirtualConsole();
const dom=new JSDOM('<!doctype html><head>'+styles+'</head><body><section class="reader-controls"><div class="reader-primary-timer"><button class="start-reading"><span>Iniciar cronômetro</span></button></div><div class="reader-subtools"><button class="btn secondary" data-action="speak">Ouvir</button><button class="icon-btn filled"><span class="reader-tool-label">Ajustes</span></button></div></section></body>',{pretendToBeVisual:true,virtualConsole:vc});
const doc=dom.window.document,style=selector=>dom.window.getComputedStyle(doc.querySelector(selector)),checks=[];function check(name,run){run();checks.push(name);console.log('PASS '+name);}
try{
check('CSS final da apresentação está embutido no host Apple',()=>assert(html.includes('One owner for the presentation controls')));
check('A cascata completa usa uma faixa flex, sem a antiga grade de quatro colunas',()=>assert.equal(style('.reader-subtools').display,'flex'));
check('Os atalhos ficam centralizados na faixa',()=>assert.equal(style('.reader-subtools').justifyContent,'center'));
check('Os atalhos não podem quebrar para outra linha',()=>assert.equal(style('.reader-subtools').flexWrap,'nowrap'));
check('O cronômetro tem altura limitada a 46px',()=>{assert.equal(style('.start-reading').height,'46px');assert.equal(style('.start-reading').maxHeight,'46px');});
check('O cronômetro não acompanha o esticamento de outra linha',()=>assert.equal(style('.reader-primary-timer').height,'46px'));
check('Atalhos mantêm 44px de altura e largura mínima de toque',()=>{assert.equal(style('.icon-btn').height,'44px');assert.equal(style('.icon-btn').minWidth,'44px');});
check('Ouvir deixa de crescer para ocupar uma coluna inteira',()=>assert.equal(style('[data-action="speak"]').flexGrow,'0'));
check('Os rótulos dos controles não quebram dentro dos botões',()=>{assert.equal(style('.reader-tool-label').whiteSpace,'nowrap');assert.equal(style('.start-reading').whiteSpace,'nowrap');});
}finally{dom.window.close();fs.writeFileSync(new URL('../QA-control-cascade-1.0.72.json',import.meta.url),JSON.stringify({success:checks.length===9,checks,environment:'Full packaged stylesheet cascade in JSDOM; responsive layout separately measured in real Edge'},null,2));}
