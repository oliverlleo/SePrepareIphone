import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../analytics.js', import.meta.url), 'utf8');
const origin = 'https://ios.seprepareapp.com.br';
const preference = 'seprepare.metrics.opt-in.v1';
const session = new Map();

function launch(url, {automated = false, optedIn = true, trialSession = new Map()} = {}) {
  const tagRequests = [];
  const local = new Map(optedIn ? [[preference, 'on']] : []);
  const scope = {
    location: new URL(url),
    navigator: {webdriver: automated, onLine: true, standalone: true},
    URLSearchParams,
    localStorage: {
      getItem: key => local.get(key) ?? null,
      setItem: (key, value) => local.set(key, value)
    },
    sessionStorage: {
      getItem: key => trialSession.get(key) ?? null,
      setItem: (key, value) => trialSession.set(key, value)
    },
    document: {
      hidden: false,
      currentScript: {dataset: {
        measurement: 'G-689TGVQP48', platform: 'iphone_ipad', version: '1.2.1', build: 'test'
      }},
      addEventListener() {},
      createElement: () => ({addEventListener() {}}),
      head: {append: tag => tagRequests.push(tag.src)}
    },
    addEventListener() {}
  };
  runInNewContext(source, scope);
  scope.SePrepareMetrics?.ready();
  return {scope, tagRequests, local};
}

const cases = [
  ['localhost consentido', 'http://localhost:4173/'],
  ['loopback consentido', 'http://127.0.0.1:4173/'],
  ['prévia HTTPS consentida', 'https://preview.example.test/'],
  ['origem parecida com a oficial', origin+'.preview.example.test/'],
  ['automação na produção', origin, {automated: true}],
  ['QA manual na produção', origin+'/?sp_qa=1', {trialSession: session}],
  ['navegação na mesma aba após sinalizar QA', origin+'/', {trialSession: session}],
  ['navegação sem consentimento na produção', origin, {optedIn: false}]
];

for (const [name, url, options] of cases) {
  const {tagRequests, scope, local} = launch(url, options);
  scope.SePrepareMetrics?.installationDetected?.();
  assert.deepEqual(tagRequests, [], name);
  assert.equal(scope.dataLayer, undefined, name);
  assert.equal(local.has('seprepare.metrics.activity.v1'), false, name);
  assert.equal(local.has('seprepare.metrics.pwa-opened.v1'), false, name);
  assert.equal(local.has('seprepare.metrics.pwa-install-pending.v1'), false, name);
}

const regular = launch(origin);
assert.equal(regular.tagRequests.length, 1);
assert(regular.scope.dataLayer.some(row => row[0] === 'event' && row[1] === 'sp_caderno_pronto'));
console.log('PASS GA4 só inicia na origem oficial, em uso normal e com consentimento.');
