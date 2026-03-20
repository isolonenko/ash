/**
 * Noise Gate AudioWorklet Processor
 *
 * RMS-based noise gate with hysteresis and hold time.
 * Silences audio below a threshold to cut background noise
 * between speech segments.
 *
 * Loaded as an AudioWorklet via `audioContext.audioWorklet.addModule(url)`.
 * Must be a separate file because AudioWorklet runs in a different thread.
 */

/* eslint-disable no-var */
declare class AudioWorkletProcessor {
  constructor(options?: AudioWorkletNodeOptions);
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}
declare function registerProcessor(name: string, processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor): void;
/* eslint-enable no-var */

interface NoiseGateParams {
  threshold: number;
  hysteresis: number;
  holdFrames: number;
}

class NoiseGateProcessor extends AudioWorkletProcessor {
  private gateOpen = false;
  private holdCounter = 0;
  private readonly threshold: number;
  private readonly hysteresis: number;
  private readonly holdFrames: number;

  constructor(options?: AudioWorkletNodeOptions) {
    super();

    const params = (options?.processorOptions ?? {}) as Partial<NoiseGateParams>;
    this.threshold = params.threshold ?? 0.01;
    this.hysteresis = params.hysteresis ?? 0.005;
    this.holdFrames = params.holdFrames ?? 10;
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0 || !output) {
      return true;
    }

    // Calculate RMS across all channels
    let sumOfSquares = 0;
    let totalSamples = 0;

    for (let channel = 0; channel < input.length; channel++) {
      const channelData = input[channel];
      if (!channelData) continue;
      for (let i = 0; i < channelData.length; i++) {
        const sample = channelData[i]!;
        sumOfSquares += sample * sample;
        totalSamples++;
      }
    }

    const rms = totalSamples > 0 ? Math.sqrt(sumOfSquares / totalSamples) : 0;

    // Hysteresis logic: different thresholds for opening vs closing
    const openThreshold = this.threshold;
    const closeThreshold = this.threshold - this.hysteresis;

    if (rms >= openThreshold) {
      this.gateOpen = true;
      this.holdCounter = this.holdFrames;
    } else if (rms < closeThreshold) {
      if (this.holdCounter > 0) {
        this.holdCounter--;
      } else {
        this.gateOpen = false;
      }
    }

    // Pass through or silence
    for (let channel = 0; channel < output.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];
      if (!inputChannel || !outputChannel) continue;

      if (this.gateOpen) {
        outputChannel.set(inputChannel);
      } else {
        outputChannel.fill(0);
      }
    }

    return true;
  }
}

registerProcessor("noise-gate-processor", NoiseGateProcessor);
