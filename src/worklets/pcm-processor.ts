class PCMProcessor extends AudioWorkletProcessor {
  private targetSampleRate: number;
  private chunkSize: number;
  private inputOffset: number;
  private buffer: number[];

  constructor(options: AudioWorkletNodeOptions) {
    super();
    const processorOptions = options.processorOptions || {};
    this.targetSampleRate = processorOptions.targetSampleRate || 24000;
    this.chunkSize = processorOptions.chunkSize || 1920;
    this.inputOffset = 0;
    this.buffer = [];
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    const ratio = sampleRate / this.targetSampleRate;
    let idx = this.inputOffset;

    while (idx < channel.length) {
      const i0 = Math.floor(idx);
      const i1 = Math.min(i0 + 1, channel.length - 1);
      const frac = idx - i0;
      const sample = channel[i0] * (1 - frac) + channel[i1] * frac;
      this.buffer.push(sample);
      idx += ratio;
    }

    this.inputOffset = idx - channel.length;

    while (this.buffer.length >= this.chunkSize) {
      const chunk = this.buffer.splice(0, this.chunkSize);
      const pcm = new Int16Array(this.chunkSize);
      for (let i = 0; i < this.chunkSize; i += 1) {
        const clamped = Math.max(-1, Math.min(1, chunk[i]));
        pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }

    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
