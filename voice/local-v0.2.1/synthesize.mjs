// SPDX-License-Identifier: GPL-3.0-or-later
import {createEspeak,toFloat32} from './dist/browser.js';

const voices = {'pt-BR':'pt-br', 'en-US':'en-us', 'es-ES':'es', 'ja-JP':'ja'};
let engine;

export async function synthesize(text, language, rate) {
  engine ??= createEspeak({
    dataUrl:new URL('./espeak-ng-data/', import.meta.url),
    languages:['pt','en','es','ja']
  }).catch(error => {
    engine = undefined;
    throw error;
  });
  const tts = await engine;
  const {samples, sampleRate, events} = tts.synthesize(text, {
    voice: voices[language],
    rate: Math.round(175 * rate)
  });
  const words = events.filter(event => event.type === 'word').map(event => ({
    at: event.audioPosition / 1000,
    index: Math.max(0, event.textPosition - 1)
  }));
  return {pcm:toFloat32(samples), sampleRate, words};
}

if (typeof WorkerGlobalScope === 'function' && self instanceof WorkerGlobalScope) {
  self.onmessage = async ({data:{id,text,language,rate}}) => {
    try {
      const audio = await synthesize(text,language,rate);
      self.postMessage({id,...audio},[audio.pcm.buffer]);
    } catch {
      self.postMessage({id,error:true});
    }
  };
}
