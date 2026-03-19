import { useEffect, useRef, useState } from "react";
import {
  SPEAKING_THRESHOLD,
  SPEAKING_CHECK_INTERVAL,
} from "@/lib/constants";

// ── Types ─────────────────────────────────────────────────

interface AnalyserEntry {
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
}

// ── Hook ──────────────────────────────────────────────────

export const useSpeakingIndicator = (
  localStream: MediaStream | null,
  remoteStreams: Map<string, MediaStream> | undefined,
): Map<string, boolean> => {
  const [speakingMap, setSpeakingMap] = useState<Map<string, boolean>>(
    () => new Map(),
  );

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, AnalyserEntry>>(new Map());

  // ── Sync analyser nodes with current streams ───────────

  useEffect(() => {
    // Collect all current stream entries: local + remotes
    const currentStreams = new Map<string, MediaStream>();

    if (localStream) {
      currentStreams.set("local", localStream);
    }

    if (remoteStreams) {
      for (const [peerId, stream] of remoteStreams) {
        currentStreams.set(peerId, stream);
      }
    }

    const analysers = analysersRef.current;

    // Remove analysers for streams that no longer exist
    for (const [peerId, entry] of analysers) {
      if (!currentStreams.has(peerId)) {
        entry.source.disconnect();
        analysers.delete(peerId);
      }
    }

    // Add analysers for new streams
    for (const [peerId, stream] of currentStreams) {
      if (!analysers.has(peerId)) {
        // Lazily initialize AudioContext on first stream
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext();
        }

        const ctx = audioCtxRef.current;
        const analyser = ctx.createAnalyser();
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        analysers.set(peerId, { analyser, source });
      }
    }
  }, [localStream, remoteStreams]);

  // ── Volume detection loop ──────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      const analysers = analysersRef.current;
      if (analysers.size === 0) return;

      const next = new Map<string, boolean>();

      for (const [peerId, entry] of analysers) {
        const data = new Uint8Array(entry.analyser.frequencyBinCount);
        entry.analyser.getByteFrequencyData(data);

        // RMS calculation (normalized 0–1)
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const normalized = data[i]! / 255;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / data.length);

        next.set(peerId, rms > SPEAKING_THRESHOLD);
      }

      setSpeakingMap(next);
    }, SPEAKING_CHECK_INTERVAL);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────

  useEffect(() => {
    const currentAnalysers = analysersRef.current;
    const currentAudioCtx = audioCtxRef.current;

    return () => {
      // Disconnect all analyser sources
      for (const [, entry] of currentAnalysers) {
        entry.source.disconnect();
      }
      currentAnalysers.clear();

      // Close AudioContext
      if (currentAudioCtx) {
        void currentAudioCtx.close();
        audioCtxRef.current = null;
      }
    };
  }, []);

  return speakingMap;
};
