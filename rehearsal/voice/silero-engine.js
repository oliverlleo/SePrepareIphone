// Exact Silero v5.1.2 model contract: 512 samples + 64 context, state[2,1,128].
export async function createSileroEngine(ort, model) {
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ['wasm'], graphOptimizationLevel: 'all'
  });
  const input = new Float32Array(576);
  let state = new Float32Array(256);
  return {
    reset() { input.fill(0); state.fill(0); },
    async probability(samples) {
      if (!(samples instanceof Float32Array) || samples.length !== 512) throw Error('Invalid PCM frame');
      input.set(samples, 64);
      const feeds = {
        input: new ort.Tensor('float32', input, [1, 576]),
        state: new ort.Tensor('float32', state, [2, 1, 128]),
        sr: new ort.Tensor('int64', BigInt64Array.from([16000n]), [])
      };
      let outputs;
      try {
        outputs = await session.run(feeds);
        const probability = Number(outputs.output.data[0]);
        if (!Number.isFinite(probability)) throw Error('Invalid speech classification');
        state = Float32Array.from(outputs.stateN.data);
        input.copyWithin(0, 512, 576);
        return Math.max(0, Math.min(1, probability));
      } finally {
        for (const tensor of Object.values(feeds)) tensor.dispose?.();
        for (const tensor of Object.values(outputs || {})) tensor.dispose?.();
      }
    },
    async close() { input.fill(0); state.fill(0); await session.release(); }
  };
}
