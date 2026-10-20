const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

// In the repository: node tests/drive-retention.test.cjs
// In an external QA folder: set SEPREPARE_REPO to the repository directory.
const repo = path.resolve(process.env.SEPREPARE_REPO || path.join(__dirname, '..'));
const appSource = fs.readFileSync(path.join(repo, 'app.js'), 'utf8');
const sourceStart = appSource.indexOf('function oM(');
const sourceEnd = appSource.indexOf('function Bb(', sourceStart);
assert(sourceStart >= 0 && sourceEnd > sourceStart, 'actual adapter boundaries');
const source = appSource.slice(sourceStart, sourceEnd);
const rawState = JSON.stringify({schema: 1, speeches: [{id: 'local'}], categories: []});
const backup = (id, at, extra = {}) => ({
  id, name: `SePrepare-${id}.json`, createdTime: new Date(at).toISOString(),
  mimeType: 'application/json', parents: ['appDataFolder'],
  appProperties: {seprepareBackup: '1', at: String(at), items: '1', hash: 'hash'}, ...extra,
});
const epoch = Date.parse('2026-10-20T12:00:00Z');
const reply = (status, value) => ({
  ok: status >= 200 && status < 300, status,
  text: async () => typeof value === 'string' ? value : JSON.stringify(value),
  json: async () => value,
});

function harness({files = [], pages, upload = backup('new', epoch), uploadStatus = 200,
  listFailurePage = -1, deleteStatuses = {}, mutateResponse, noFiles = false,
  alreadySaved = false} = {}) {
  const calls = [];
  const removed = [];
  let listCount = 0;
  let hasUploaded = alreadySaved;
  const fetch = async (target, options = {}) => {
    const url = new URL(target);
    const method = options.method || 'GET';
    assert.equal(options.headers.Authorization, 'Bearer test-only-token');
    assert.equal(url.origin, 'https://www.googleapis.com', 'no actual external fetch');
    calls.push({method, path: url.pathname, search: url.search});
    if (method === 'POST' && url.pathname === '/upload/drive/v3/files') {
      assert.equal(url.searchParams.get('uploadType'), 'multipart');
      assert.match(options.body, /"parents":\["appDataFolder"\]/);
      assert.match(options.body, /"seprepareBackup":"1"/);
      hasUploaded = uploadStatus >= 200 && uploadStatus < 300;
      return reply(uploadStatus, hasUploaded ? upload : {error: {errors: [{reason: 'upload-failed'}]}});
    }
    if (method === 'GET' && url.pathname === '/drive/v3/files') {
      assert.equal(url.searchParams.get('spaces'), 'appDataFolder');
      assert.match(url.searchParams.get('q'), /trashed\s*=\s*false/);
      assert.match(url.searchParams.get('q'), /seprepareBackup/);
      assert.equal(url.searchParams.get('orderBy'), 'createdTime desc');
      const token = url.searchParams.get('pageToken');
      const number = token ? Number(token.slice(5)) : 0;
      assert.equal(number, listCount, 'sequential complete pages');
      listCount++;
      if (number === listFailurePage) return reply(503, {error: {errors: [{reason: 'list-failed'}]}});
      const resultPages = pages || [files];
      assert(number < resultPages.length, `unexpected page ${number}`);
      const result = noFiles ? {} : {files: resultPages[number]};
      if (number + 1 < resultPages.length) result.nextPageToken = `page-${number + 1}`;
      return reply(200, mutateResponse ? mutateResponse(result, number) : result);
    }
    if (method === 'DELETE' && url.pathname.startsWith('/drive/v3/files/')) {
      assert(hasUploaded, 'never delete before successful upload');
      const id = decodeURIComponent(url.pathname.slice('/drive/v3/files/'.length));
      const status = deleteStatuses[id] || 204;
      if (status >= 200 && status < 300 || status === 404) removed.push(id);
      return reply(status, {error: {errors: [{reason: status === 404 ? 'notFound' : 'delete-failed'}]}});
    }
    throw new Error(`Unexpected mocked API request ${method} ${target}`);
  };
  const context = vm.createContext({
    fetch, TextEncoder, URL, Date, console: {...console, warn() {}},
    pn: class extends Error {constructor(status, reason) {super(reason); this.status=status; this.reason=reason;}},
    er: async () => 'hash',
    rM: async (state, createdAt) => JSON.stringify({format:'seprepare-drive-backup', backupSchema:1, state, createdAt}),
    aM: async value => value,
    XO: 26000000,
  });
  vm.runInContext(`${source}\nthis.adapter=oM('test-only-token');`, context);
  return {adapter: context.adapter, calls, removed, listCount: () => listCount};
}

const cases = [];
const test = (name, fn) => cases.push({name, fn});
const pending = result => assert.equal(result.cleanupPending, true);
const okay = result => assert.notEqual(result.cleanupPending, true);
const deletions = h => h.calls.filter(call => call.method === 'DELETE');

test('one to four backups: never removes a copy', async () => {
  for (let count=1; count<=4; count++) {
    const old = Array.from({length:count-1}, (_,i) => backup(`old${i}`,epoch-(i+1)*1000));
    const h = harness({files:[backup('new',epoch), ...old]});
    const result=await h.adapter.create(rawState,epoch);
    okay(result); assert.equal(result.id,'new'); assert.equal(deletions(h).length,0);
  }
});

test('fifth backup: saves then removes only the oldest', async () => {
  const old=Array.from({length:4}, (_,i)=>backup(`old${i}`,epoch-(i+1)*1000));
  const h=harness({files:[backup('new',epoch), ...old]});
  okay(await h.adapter.create(rawState,epoch));
  assert.deepEqual(h.removed,['old3']);
  assert.equal(h.calls[0].method,'POST');
});

test('existing accumulation over 1000: reads every page before oldest-first pruning', async () => {
  const all=[backup('new',epoch), ...Array.from({length:1104},(_,i)=>backup(`old${i}`,epoch-(i+1)*1000))];
  const pages=Array.from({length:Math.ceil(all.length/100)},(_,i)=>all.slice(i*100,(i+1)*100));
  const h=harness({pages});
  okay(await h.adapter.create(rawState,epoch));
  assert.equal(h.listCount(),12);
  assert.equal(h.removed.length,1101);
  assert.deepEqual(h.removed.slice(0,2),['old1103','old1102']);
  assert.equal(h.removed.at(-1),'old3');
  const firstDelete=h.calls.findIndex(x=>x.method==='DELETE');
  assert.equal(firstDelete,13,'POST + 12 completed list pages before first delete');
});

test('failed upload: never lists or deletes', async () => {
  const h=harness({uploadStatus:503});
  await assert.rejects(()=>h.adapter.create(rawState,epoch));
  assert.equal(h.calls.length,1); assert.equal(deletions(h).length,0);
});

test('failed first list: preserves saved backup and defers cleanup', async () => {
  const h=harness({listFailurePage:0});
  const result=await h.adapter.create(rawState,epoch);
  assert.equal(result.id,'new'); pending(result); assert.equal(deletions(h).length,0);
});

test('failed later list page: never prunes a partial listing', async () => {
  const page=[backup('new',epoch), ...Array.from({length:99},(_,i)=>backup(`old${i}`,epoch-(i+1)*1000))];
  const h=harness({pages:[page,[backup('old99',epoch-100000)]],listFailurePage:1});
  const result=await h.adapter.create(rawState,epoch);
  assert.equal(result.id,'new'); pending(result); assert.equal(deletions(h).length,0);
});

test('failed delete: saved backup stays successful with cleanup pending', async () => {
  const all=[backup('new',epoch), ...Array.from({length:5},(_,i)=>backup(`old${i}`,epoch-(i+1)*1000))];
  const h=harness({files:all,deleteStatuses:{old4:403}});
  const result=await h.adapter.create(rawState,epoch);
  assert.equal(result.id,'new'); pending(result);
  assert(!h.removed.includes('new'));
});

test('concurrent deletion 404: treated as already removed', async () => {
  const all=[backup('new',epoch), ...Array.from({length:5},(_,i)=>backup(`old${i}`,epoch-(i+1)*1000))];
  const h=harness({files:all,deleteStatuses:{old4:404}});
  okay(await h.adapter.create(rawState,epoch));
  assert.deepEqual(h.removed,['old4','old3']);
});

test('client clock skew: retain by Google createdTime', async () => {
  const all=[backup('new',epoch), ...Array.from({length:4},(_,i)=>backup(`old${i}`,epoch-(i+1)*1000,
    {appProperties:{seprepareBackup:'1',at:String(epoch+(i+1)*1000000)}}))];
  const h=harness({files:all});
  okay(await h.adapter.create(rawState,epoch));
  assert.deepEqual(h.removed,['old3']);
});

test('new upload missing from listing: skip deletion safely', async () => {
  const h=harness({files:Array.from({length:5},(_,i)=>backup(`old${i}`,epoch-(i+1)*1000))});
  const result=await h.adapter.create(rawState,epoch);
  assert.equal(result.id,'new'); pending(result); assert.equal(deletions(h).length,0);
});

test('new upload outside newest four: skip deletion safely', async () => {
  const h=harness({files:[...Array.from({length:5},(_,i)=>backup(`other${i}`,epoch+(i+1)*1000)),backup('new',epoch)]});
  const result=await h.adapter.create(rawState,epoch);
  assert.equal(result.id,'new'); pending(result); assert.equal(deletions(h).length,0);
});

test('marker and folder guard: never deletes unrelated entries', async () => {
  const old=Array.from({length:4},(_,i)=>backup(`old${i}`,epoch-(i+1)*1000));
  const unrelated=[
    backup('other-marker',epoch-100000,{appProperties:{seprepareBackup:'0'}}),
    backup('missing-marker',epoch-110000,{appProperties:{}}),
    backup('a-folder',epoch-120000,{mimeType:'application/vnd.google-apps.folder'}),
  ];
  const h=harness({files:[backup('new',epoch), ...old, ...unrelated]});
  const result=await h.adapter.create(rawState,epoch);
  assert.equal(result.id,'new');
  assert(!h.removed.some(id=>unrelated.some(file=>file.id===id)));
  assert(!h.removed.includes('new'));
});

test('public list exhausts pagination over 1000', async () => {
  const all=Array.from({length:1105},(_,i)=>backup(`b${i}`,epoch-i*1000));
  const pages=Array.from({length:Math.ceil(all.length/100)},(_,i)=>all.slice(i*100,(i+1)*100));
  const h=harness({pages});
  const result=await h.adapter.list();
  assert.equal(result.length,all.length); assert.equal(h.listCount(),12); assert.equal(deletions(h).length,0);
});

test('incompleteSearch: preserves every copy', async () => {
  const all=[backup('new',epoch), ...Array.from({length:5},(_,i)=>backup(`old${i}`,epoch-(i+1)*1000))];
  const h=harness({files:all,mutateResponse:result=>({...result,incompleteSearch:true})});
  pending(await h.adapter.create(rawState,epoch)); assert.equal(deletions(h).length,0);
});

test('repeated page token: aborts without deleting', async () => {
  const all=[backup('new',epoch), ...Array.from({length:5},(_,i)=>backup(`old${i}`,epoch-(i+1)*1000))];
  const h=harness({pages:[all,all],mutateResponse:result=>({...result,nextPageToken:'page-1'})});
  pending(await h.adapter.create(rawState,epoch));
  assert.equal(h.listCount(),2); assert.equal(deletions(h).length,0);
});

test('malformed files field: aborts without deleting', async () => {
  const h=harness({mutateResponse:()=>({files:{id:'not-an-array'}})});
  pending(await h.adapter.create(rawState,epoch)); assert.equal(deletions(h).length,0);
});

test('invalid backup ID or date: validate entire list before any delete', async () => {
  for(const bad of [backup('invalid/path',epoch-100000),backup('bad-date',epoch-100000,{createdTime:'invalid'})]){
    const all=[backup('new',epoch), ...Array.from({length:5},(_,i)=>backup(`old${i}`,epoch-(i+1)*1000)),bad];
    const h=harness({files:all});
    pending(await h.adapter.create(rawState,epoch)); assert.equal(deletions(h).length,0);
  }
});

test('invalid uploaded ID: no cleanup begins', async () => {
  const h=harness({upload:backup('invalid/path',epoch)});
  await assert.rejects(()=>h.adapter.create(rawState,epoch));
  assert.equal(h.calls.length,1); assert.equal(deletions(h).length,0);
});

test('duplicate IDs across pages: cannot count duplicates as extra copies', async () => {
  const all=[backup('new',epoch), ...Array.from({length:3},(_,i)=>backup(`old${i}`,epoch-(i+1)*1000))];
  const h=harness({pages:[all,all]});
  okay(await h.adapter.create(rawState,epoch)); assert.equal(deletions(h).length,0);
});

test('unchanged existing backup: cleanup can retry without another upload', async () => {
  const all=[backup('new',epoch), ...Array.from({length:5},(_,i)=>backup(`old${i}`,epoch-(i+1)*1000))];
  const h=harness({files:all,alreadySaved:true});
  assert.equal(await h.adapter.retainLatest('new'),true);
  assert.deepEqual(h.removed,['old4','old3']);
  assert(!h.calls.some(call=>call.method==='POST'));
});

(async()=>{
  const report=[];
  for(const entry of cases){
    try{await entry.fn(); report.push({name:entry.name,pass:true}); console.log(`PASS ${entry.name}`);}
    catch(error){report.push({name:entry.name,pass:false,error:error.stack}); console.error(`FAIL ${entry.name}\n${error.stack}`);}
  }
  if(process.env.DRIVE_RETENTION_REPORT)fs.writeFileSync(process.env.DRIVE_RETENTION_REPORT,JSON.stringify({
    sourceFile:path.join(repo,'app.js'),sourceHash:require('node:crypto').createHash('sha256').update(source).digest('hex'),
    tests:report},null,2));
  const failed=report.filter(x=>!x.pass).length;
  console.log(`${report.length-failed}/${report.length} passed`);
  if(failed)process.exitCode=1;
})();
