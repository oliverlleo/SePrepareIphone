import { createSileroEngine } from './silero-engine.js';
let engine, token = 0, chain = Promise.resolve();
self.onmessage = ({data}) => {
  chain = chain.then(async () => {
    if (data.type === 'init') {
      importScripts('ort.wasm.min.js');
      // Scalar, single-thread WASM also works on Safari without SIMD/SharedArrayBuffer.
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = false;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = new URL('.', self.location.href).href;
      const response = await fetch('silero_vad.onnx');
      if (!response.ok) throw Error('Speech model unavailable');
      const model = await response.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', model))].map(x=>x.toString(16).padStart(2,'0')).join('');
      if (hash !== '2623a2953f6ff3d2c1e61740c6cdb7168133479b267dfef114a4a3cc5bdd788f') throw Error('Speech model integrity');
      engine = await createSileroEngine(ort, model);
      await engine.probability(new Float32Array(512));
      engine.reset();
      self.postMessage({type:'ready',id:data.id});
    } else if (data.type === 'reset') {
      if (!engine) throw Error('Speech engine not ready');
      engine.reset(); token = data.token;
      self.postMessage({type:'reset',id:data.id,token});
    } else if (data.type === 'frame' && data.token === token) {
      const probability = await engine.probability(data.samples);
      self.postMessage({type:'result',token,probability});
    }
  }).catch(() => self.postMessage({type:'error',id:data.id,token:data.token}));
};
