import {createHash} from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../sharing/node_modules/acorn/dist/acorn.mjs';
import { build } from '../sharing/node_modules/esbuild/lib/main.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const marker = (name, code) => `/* SEPREPARE REHEARSAL ${name} START */${code}/* SEPREPARE REHEARSAL ${name} END */`;

let source = readFileSync(path.join(root, 'app.js'), 'utf8')
  .replace(/\/\* SEPREPARE REHEARSAL ([A-Z]+) START \*\/[\s\S]*?\/\* SEPREPARE REHEARSAL \1 END \*\//g, '');

const ranges = [...source.matchAll(/\/\* SEPREPARE [A-Z]+ (BUNDLE|CODEC) START \*\/[\s\S]*?\/\* SEPREPARE [A-Z]+ \1 END \*\//g)]
  .map(m => [m.index, m.index + m[0].length]);

const nodes = [];
function walk(n) {
  if (!n || typeof n !== 'object' || (n.type && ranges.some(([a, b]) => n.start >= a && n.end <= b))) return;
  if (n.type) nodes.push(n);
  for (const value of Object.values(n)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') walk(value);
  }
}
walk(parse(source, { ecmaVersion: 'latest' }));

const text = n => source.slice(n.start, n.end);
const only = (list, label) => {
  if (list.length !== 1) throw Error('Rehearsal host anchor ' + label + ': ' + list.length);
  return list[0];
};
const fn = (name, match = '') => only(
  nodes.filter(n => n.type === 'FunctionDeclaration' && n.id?.name === name && text(n).includes(match)),
  name
);

const edits = [];
const edit = (a, b, code) => edits.push({ a, b, code });
const hook = (n, label, code, end = false) =>
  edit(end ? n.body.end - 1 : n.body.start + 1, end ? n.body.end - 1 : n.body.start + 1, marker(label, code));

const bridge = only(
  nodes.filter(n => n.type === 'VariableDeclaration' && n.declarations.some(d => d.id?.name === 'SPShareCodes')),
  'bridge'
);

const helpers = `
var sp73Rehearsal = window.SePrepareRehearsal.createInteractiveRehearsalUI({
  $: L,
  $$: $t,
  rt: d,
  icon: te,
  esc: P,
  btn: oe,
  t: SPLocale.t,
  tr: SPLocale.tr,
  getActive: ue,
  getSettings: () => B.settings,
  audioPlayer,
  openModal: Te,
  closeModal: he,
  persist: le,
  toast: ae,
  openEditor: id => { d.editorFrom = d.returnTo || 'home'; gt('editor', id); },
  refreshIdentity: () => { const s = ue(), el = L('.reader-identity'); if (s && el) el.outerHTML = xM(s); },
  renderReaderContent: Ha,
  ensureTimerRunning: () => { const s = ue(); if (s && !s.timer?.running) { Ln(s); le(true); wn(); } },
  pauseTimerIfRunning: () => { const s = ue(); if (s && s.timer?.running) { Ln(s); le(true); wn(); } },
  finishRehearsalRecord: meta => yM(meta),
  setReaderPage: p => { d.page = p; Ha(); }
});
window.SePrepareRehearsalRuntime = sp73Rehearsal;
function sp73IdentityHTML(t) {
  return SPLocale.h\`<div class="reader-identity"><span>\${t.myParticipantId ? SPLocale.h\`Suas falas: <strong>\${P(va(t, t.myParticipantId))}</strong>\` : SPLocale.t("Acompanhando todas as falas")}</span><div class="reader-identity-actions">\${oe("choose-my-participant", SPLocale.t("Quem sou eu"), "Users", "small secondary")}\${Ge("toggle-my-lines", "ListFilter", SPLocale.t("Ver somente minhas falas"), \`aria-pressed="\${Cl(t)}" \${El(t) ? "" : "disabled"}\`, "reader-only-mine")}\${sp73Rehearsal ? sp73Rehearsal.entryButtonHTML(t) : ""}</div></div>\`;
}
function sp73FinishVersion(t, options = {}) {
  let e = nt(t), r = t.timer, a = km(t);
  if (!a && !r.running) return null;
  const interactiveMeta = options?.mode === 'interactive'
    ? { rehearsalMode: 'interactive', interactionMode: options.interactionMode === 'auto' ? 'auto' : 'manual' }
    : {};
  if (a > 0) {
    t.rehearsals.push({
      at: Date.now(),
      duration: a,
      versionId: e.id,
      versionName: e.name,
      contentRevision: r.contentRevision ?? null,
      contentKey: r.contentKey || null,
      ...interactiveMeta,
      ...(r.legacy ? { legacy: true } : {}),
      ...(r.contentChanged ? { contentChanged: true } : {})
    });
  }
  t.timer = { active: false, running: false, elapsedMs: 0, startedAt: 0, versionId: e.id };
  nt(t);
  return { duration: a };
}
function sp73FinishAction(options) {
  let t = ue();
  if (!t) return;
  const meta = options || sp73Rehearsal?.consumeFinishMetadata();
  let e = sp73FinishVersion(t, meta);
  if (!e) { ae(SPLocale.t("Inicie o cronômetro para registrar um ensaio.")); return; }
  le(true);
  wn();
  ae(e.duration > 0 ? SPLocale.tr\`Ensaio salvo: \${xa(e.duration)}.\` : SPLocale.t("Cronômetro encerrado."));
}
function sp73RehearsalLabel(t, e) {
  const prefix = t?.rehearsalMode === 'interactive' ? SPLocale.t("Ensaio interativo") + " · " : "";
  return prefix + (
    t.contentChanged
      ? SPLocale.t("Texto alterado durante o ensaio")
      : t.legacy || !t.contentKey
        ? SPLocale.t("Registro anterior à atualização")
        : t.contentKey === e.contentKey
          ? SPLocale.t("Texto atual")
          : SPLocale.tr\`Texto anterior · revisão \${t.contentRevision || 1}\`
  );
}
function sp73GuideTopic() {
  return {
    id: 'interactive-rehearsal',
    symbol: 'Mic',
    title: SPLocale.t('Ensaio interativo'),
    detail: SPLocale.t('Treinar demonstrações sozinho com os outros participantes narrados'),
    steps: [
      SPLocale.html('Abra uma <strong>Demonstração</strong> na apresentação e confirme seu nome em <strong>Quem sou eu</strong>.'),
      SPLocale.html('Toque em <strong>Ensaio interativo</strong> e escolha <strong>Manual</strong> (você indica quando terminou) ou <strong>Automático</strong> (detecção local de pausa pelo microfone).'),
      SPLocale.html('Use <strong>Ocultar minhas falas</strong> e <strong>Mostrar dica</strong> se quiser treinar de memória com revelação progressiva.'),
      SPLocale.html('O SePrepare narra as falas dos demais participantes e pausa na sua vez. Use repetir, voltar uma fala ou pular quando precisar.')
    ],
    tip: SPLocale.t('O modo Manual funciona sem microfone. No modo Automático, o áudio fica somente na memória temporária do aparelho: nada é gravado nem enviado.')
  };
}
function sp73OpenGuideTopic(topicId) {
  oI.handle('guide');
  setTimeout(() => {
    const detail = document.getElementById('guide-' + topicId);
    if (detail) {
      detail.open = true;
      detail.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, 0);
}
`;

edit(bridge.start, bridge.start, marker('BRIDGE', helpers));

hook(fn('xM'), 'IDENTITY', 'if(se(t))return sp73IdentityHTML(t);');
hook(fn('t0'), 'MOUNT', ';sp73Rehearsal?.mountBar();', true);
hook(fn('r0'), 'PAGES', 'if(sp73Rehearsal?.shouldShowAllLines())r=false;');
hook(fn('ds'), 'READER', ';sp73Rehearsal?.syncReaderDom({scrollToTurn:false});', true);
hook(
  fn('fr', 'document.body.classList.toggle'),
  'DISPOSE',
  'if(window.orador&&!window.orador.getRehearsal)window.orador.getRehearsal=()=>sp73Rehearsal;sp73Rehearsal?.checkContextContinuity();'
);
hook(fn('he', 'audioPlayer.stopPreview'), 'CLOSE', 'sp73Rehearsal?.onModalClosed(d.modal);');
hook(fn('Hb'), 'TIMER', ';sp73Rehearsal?.syncTimerState(!!ue()?.timer?.running);', true);
hook(fn('bM'), 'RESTART', 'sp73Rehearsal?.dispose();');
hook(fn('On'), 'FINISHVER', 'return sp73FinishVersion(t,arguments[1]);');
hook(fn('yM'), 'FINISHACT', 'return sp73FinishAction(arguments[0]);');
hook(fn('Mn'), 'LABEL', 'return sp73RehearsalLabel(t,e);');

const support = fn('bb');
const guideFn = only(
  nodes.filter(n => n.type === 'FunctionDeclaration' && n.start > support.start && n.end < support.end && n.id?.name === 'l'),
  'support guide modal'
);
edit(
  guideFn.start,
  guideFn.start,
  marker('GUIDE', 'if(!n.some(x=>x.id==="interactive-rehearsal")){const idx=n.findIndex(x=>x.id==="parts");if(idx>=0)n.splice(idx+1,0,sp73GuideTopic());else n.push(sp73GuideTopic());}')
);
const supportHandle = only(
  nodes.filter(n => n.type === 'FunctionDeclaration' && n.start > support.start && n.end < support.end && n.id?.name === 'm'),
  'support handle'
);
hook(supportHandle, 'SUPPORTACT', 'if(p==="interactive-rehearsal-guide"){sp73OpenGuideTopic("interactive-rehearsal");return true;}');

const actions = only(
  nodes.filter(n => n.type === 'SwitchStatement' && n.discriminant?.name === 'r' && n.cases.some(c => c.test?.value === 'share-text')),
  'actions'
);
edit(actions.start, actions.start, marker('HANDLE', 'if(sp73Rehearsal?.handle(r,e))return;'));

for (const c of edits.sort((a, b) => b.a - a.a)) {
  if (c.a > c.b) throw Error('Invalid rehearsal edit range');
  source = source.slice(0, c.a) + c.code + source.slice(c.b);
}

const bundled = await build({
  absWorkingDir: here,
  entryPoints: ['entry.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['safari15.4'],
  loader: { '.css': 'text' },
  write: false,
  legalComments: 'eof'
});

const endLocale = '/* SEPREPARE LOCALE END */';
const at = source.indexOf(endLocale) + endLocale.length;
if (at < endLocale.length) throw Error('Locale bootstrap marker missing');
source = source.slice(0, at) + marker('BUNDLE', bundled.outputFiles[0].text) + source.slice(at);
source = source.replace(/(\/\* SEPREPARE SHARE CODEC END \*\/)[\r\n]+/, '$1\n');
parse(source, { ecmaVersion: 'latest' });
writeFileSync(path.join(root, 'app.js'), source);
console.log('Ensaio interativo 1.0.74 integrado ao host Apple preservado.');

const voiceDir=path.join(root,'voice/v1.0.74');mkdirSync(voiceDir,{recursive:true});
const voiceMeta=JSON.parse(readFileSync(path.join(here,'voice/upstream.json'),'utf8'));
for(const [name,expected] of Object.entries(voiceMeta.files)) {
 const bytes=readFileSync(path.join(here,'voice',name));
 if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Voice asset integrity: '+name);
 copyFileSync(path.join(here,'voice',name),path.join(voiceDir,name));
}
for(const name of ['pcm-resampler.js','pcm-capture-worklet.js','upstream.json'])copyFileSync(path.join(here,'voice',name),path.join(voiceDir,name));
await build({absWorkingDir:here,entryPoints:['voice/worker-entry.js'],outfile:path.join(voiceDir,'speech-worker.js'),bundle:true,minify:true,format:'iife',target:'safari15.4',legalComments:'eof'});
