import { PcmFrameResampler } from './pcm-resampler.js';
class SpeechCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.token = 0;
    this.resampler = new PcmFrameResampler(sampleRate, samples => {
      this.port.postMessage({ type: 'frame', token: this.token, samples }, [samples.buffer]);
    });
    this.port.onmessage = event => {
      this.active = Boolean(event.data.active);
      this.token = event.data.token;
      this.resampler.reset();
    };
  }
  process(inputs, outputs) {
    // Raw microphone audio is never routed to speakers.
    for (const channel of outputs[0] || []) channel.fill(0);
    if (this.active && inputs[0]?.[0]) {
      const channels=inputs[0];
      if(channels.length===1)this.resampler.push(channels[0]);
      else {
        if(this.mono?.length!==channels[0].length)this.mono=new Float32Array(channels[0].length);
        this.mono.fill(0);
        for(const channel of channels)for(let i=0;i<channel.length;i++)this.mono[i]+=channel[i]/channels.length;
        this.resampler.push(this.mono);
      }
    }
    return true;
  }
}
registerProcessor('seprepare-speech-capture', SpeechCapture);
