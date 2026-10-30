export function createWebSpeechClassifier({
  WorkerClass = globalThis.Worker,
  baseURL = typeof document !== 'undefined' ? new URL('./voice/v1.0.74/', document.baseURI).href : '',
  setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout
} = {}) {
  let worker, ready, requestId = 0, activeToken = 0, pendingFrames = 0;
  const requests = new Map();
  let onResult, onError;
  function request(type, extra = {}, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      const timeout = setTimeoutFn(() => {
        requests.delete(id); reject(Error('Speech engine timeout'));
      }, timeoutMs);
      requests.set(id, {resolve,reject,timeout});
      worker.postMessage({type,id,...extra});
    });
  }
  function fail() { onError?.({code:'classifier-failed'}); }
  function ensure() {
    if (ready) return ready;
    ready = (async () => {
      if (!WorkerClass) throw Error('Speech worker unavailable');
      worker = new WorkerClass(new URL('speech-worker.js',baseURL));
      worker.onerror = () => {
        for (const request of requests.values()) { clearTimeoutFn(request.timeout); request.reject(Error('Speech worker failed')); }
        requests.clear(); fail();
      };
      worker.onmessage = ({data}) => {
        if (data.id && requests.has(data.id)) {
          const req = requests.get(data.id); requests.delete(data.id); clearTimeoutFn(req.timeout);
          if (data.type === 'error') req.reject(Error('Speech engine failed')); else req.resolve();
        } else if (data.type === 'result' && data.token === activeToken) {
          pendingFrames = Math.max(0,pendingFrames-1);
          onResult?.(data.probability);
        } else if (data.type === 'error' && data.token === activeToken) fail();
      };
      await request('init');
    })();
    return ready;
  }
  return {
    ensure,
    async startTurn(token, result, error) {
      await ensure();
      activeToken = token; pendingFrames = 0; onResult = result; onError = error;
      await request('reset',{token},3000);
    },
    push(samples,token) {
      if (!worker || token !== activeToken) return;
      if (++pendingFrames > 24) { fail(); return; }
      worker.postMessage({type:'frame',token,samples},[samples.buffer]);
    },
    stopTurn() { activeToken=0; pendingFrames=0; onResult=onError=null; },
    release() {
      this.stopTurn();
      for (const request of requests.values()) { clearTimeoutFn(request.timeout); request.reject(Error('Speech session cancelled')); }
      requests.clear();worker?.terminate();worker=null;ready=null;
    }
  };
}
