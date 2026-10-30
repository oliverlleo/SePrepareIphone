// Area resampling preserves partial reads and actual audio duration at 44.1/48 kHz.
export class PcmFrameResampler {
  constructor(sampleRate, emit) {
    if (!(sampleRate >= 8000 && sampleRate <= 192000)) throw Error('Invalid sample rate');
    this.ratio = sampleRate / 16000;
    this.emit = emit;
    this.reset();
  }
  reset() { this.frame = new Float32Array(512); this.count = 0; this.fill = 0; this.sum = 0; }
  push(samples) {
    for (let i = 0; i < samples.length; i++) {
      const value = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0;
      let remaining = 1;
      while (remaining > 1e-9) {
        const take = Math.min(remaining, this.ratio - this.fill);
        this.sum += take * value;
        this.fill += take;
        remaining -= take;
        if (this.fill >= this.ratio - 1e-9) {
          this.frame[this.count++] = this.sum / this.ratio;
          this.sum = this.fill = 0;
          if (this.count === 512) {
            this.emit(this.frame);
            this.frame = new Float32Array(512);
            this.count = 0;
          }
        }
      }
    }
  }
}
