import { useState, useRef, useCallback, useEffect } from "react";
import type { AudioProcessingState } from "@/types";
import {
  AUDIO_HIGHPASS_FREQUENCY,
  AUDIO_HIGHPASS_Q,
  AUDIO_COMPRESSOR_THRESHOLD,
  AUDIO_COMPRESSOR_KNEE,
  AUDIO_COMPRESSOR_RATIO,
  AUDIO_COMPRESSOR_ATTACK,
  AUDIO_COMPRESSOR_RELEASE,
  NOISE_GATE_THRESHOLD,
  NOISE_GATE_HYSTERESIS,
  NOISE_GATE_HOLD_FRAMES,
} from "@/lib/constants";

import noiseGateProcessorUrl from "@/audio/noise-gate-processor.ts?url";

interface AudioProcessingNodes {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  highPass: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  noiseGateNode: AudioWorkletNode;
  rnnoiseNode: AudioWorkletNode;
  destination: MediaStreamAudioDestinationNode;
}

interface UseAudioProcessingResult {
  state: AudioProcessingState;
  startProcessing: (
    rawTrack: MediaStreamTrack,
  ) => Promise<MediaStreamTrack | null>;
  stopProcessing: () => void;
  toggle: (rawTrack: MediaStreamTrack) => Promise<MediaStreamTrack | null>;
}

export function useAudioProcessing(): UseAudioProcessingResult {
  const [state, setState] = useState<AudioProcessingState>({
    isEnabled: false,
    isLoading: false,
    error: null,
  });

  const nodesRef = useRef<AudioProcessingNodes | null>(null);
  const rawTrackRef = useRef<MediaStreamTrack | null>(null);

  const stopProcessingInternal = useCallback(() => {
    const nodes = nodesRef.current;
    if (!nodes) return;
    nodes.rnnoiseNode.disconnect();
    nodes.noiseGateNode.disconnect();
    nodes.compressor.disconnect();
    nodes.highPass.disconnect();
    nodes.source.disconnect();
    void nodes.context.close();
    nodesRef.current = null;
  }, []);

  const startProcessing = useCallback(
    async (rawTrack: MediaStreamTrack): Promise<MediaStreamTrack | null> => {
      if (nodesRef.current) {
        stopProcessingInternal();
      }

      rawTrackRef.current = rawTrack;
      setState({ isEnabled: false, isLoading: true, error: null });

      try {
        const context = new AudioContext({ latencyHint: "interactive" });

        await context.audioWorklet.addModule(noiseGateProcessorUrl);
        const { RnnoiseWorkletNode, loadRnnoise } = await import(
          "@sapphi-red/web-noise-suppressor"
        );
        const rnnoiseWasmUrl = (
          await import("@sapphi-red/web-noise-suppressor/rnnoise.wasm?url")
        ).default;
        const rnnoiseSimdWasmUrl = (
          await import(
            "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url"
          )
        ).default;
        const rnnoiseWorkletUrl = (
          await import(
            "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url"
          )
        ).default;
        await context.audioWorklet.addModule(rnnoiseWorkletUrl);
        const wasmBinary = await loadRnnoise({
          url: rnnoiseWasmUrl,
          simdUrl: rnnoiseSimdWasmUrl,
        });
        const source = context.createMediaStreamSource(
          new MediaStream([rawTrack]),
        );
        const highPass = context.createBiquadFilter();
        highPass.type = "highpass";
        highPass.frequency.value = AUDIO_HIGHPASS_FREQUENCY;
        highPass.Q.value = AUDIO_HIGHPASS_Q;
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = AUDIO_COMPRESSOR_THRESHOLD;
        compressor.knee.value = AUDIO_COMPRESSOR_KNEE;
        compressor.ratio.value = AUDIO_COMPRESSOR_RATIO;
        compressor.attack.value = AUDIO_COMPRESSOR_ATTACK;
        compressor.release.value = AUDIO_COMPRESSOR_RELEASE;
        const noiseGateNode = new AudioWorkletNode(
          context,
          "noise-gate-processor",
          {
            processorOptions: {
              threshold: NOISE_GATE_THRESHOLD,
              hysteresis: NOISE_GATE_HYSTERESIS,
              holdFrames: NOISE_GATE_HOLD_FRAMES,
            },
          },
        );
        const rnnoiseNode = new RnnoiseWorkletNode(context, {
          wasmBinary,
          maxChannels: 1,
        });
        const destination = context.createMediaStreamDestination();
        source.connect(highPass);
        highPass.connect(compressor);
        compressor.connect(noiseGateNode);
        noiseGateNode.connect(rnnoiseNode);
        rnnoiseNode.connect(destination);

        nodesRef.current = {
          context,
          source,
          highPass,
          compressor,
          noiseGateNode,
          rnnoiseNode,
          destination,
        };

        setState({ isEnabled: true, isLoading: false, error: null });
        return destination.stream.getAudioTracks()[0] ?? null;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Audio processing failed";
        console.error("[AudioProcessing] Failed to initialize:", err);
        setState({ isEnabled: false, isLoading: false, error: message });
        return null;
      }
    },
    [stopProcessingInternal],
  );

  const stopProcessing = useCallback(() => {
    stopProcessingInternal();
    rawTrackRef.current = null;
    setState({ isEnabled: false, isLoading: false, error: null });
  }, [stopProcessingInternal]);

  const toggle = useCallback(
    async (rawTrack: MediaStreamTrack): Promise<MediaStreamTrack | null> => {
      if (nodesRef.current) {
        stopProcessing();
        return rawTrack;
      }
      return startProcessing(rawTrack);
    },
    [startProcessing, stopProcessing],
  );

  useEffect(() => {
    return () => {
      stopProcessingInternal();
    };
  }, [stopProcessingInternal]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const ctx = nodesRef.current?.context;
      if (!ctx) return;

      if (document.hidden) {
        void ctx.suspend();
      } else {
        void ctx.resume();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return { state, startProcessing, stopProcessing, toggle };
}
