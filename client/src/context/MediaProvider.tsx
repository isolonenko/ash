import {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";
import type { MediaContextValue } from "@/types";
import { MediaContext } from "@/context/media-context";
import { useNetworkQuality } from "@/hooks/useNetworkQuality";
import { BITRATE_TIERS } from "@/lib/constants";
import { useAudioProcessing } from "@/hooks/useAudioProcessing";

interface MediaProviderProps {
  children: ReactNode;
}

export const MediaProvider = ({ children }: MediaProviderProps) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [ready, setReady] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const rawAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const connectionIdRef = useRef(0);
  const networkTier = useNetworkQuality();
  const replaceTrackCallbackRef = useRef<
    ((track: MediaStreamTrack) => void) | null
  >(null);

  const audioProcessing = useAudioProcessing();

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== "live") return;

    const tier = BITRATE_TIERS[networkTier];
    videoTrack
      .applyConstraints({
        width: { ideal: tier.width },
        height: { ideal: tier.height },
        frameRate: { ideal: tier.fps },
      })
      .catch(() => {});
  }, [networkTier]);

  const acquire = useCallback(async (): Promise<MediaStream> => {
    const capturedId = ++connectionIdRef.current;
    const tier = BITRATE_TIERS[networkTier];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: tier.width },
          height: { ideal: tier.height },
          frameRate: { ideal: tier.fps },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: false, // Disabled — our pipeline handles this
          autoGainControl: true,
        },
      });

      if (connectionIdRef.current !== capturedId) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("Stale acquire call");
      }

      // Store the raw audio track for toggle
      const rawAudioTrack = stream.getAudioTracks()[0] ?? null;
      rawAudioTrackRef.current = rawAudioTrack;

      // Start audio processing pipeline
      if (rawAudioTrack) {
        const processedTrack =
          await audioProcessing.startProcessing(rawAudioTrack);
        if (processedTrack) {
          // Replace the raw audio track with the processed one in the stream
          stream.removeTrack(rawAudioTrack);
          stream.addTrack(processedTrack);
        }
      }

      streamRef.current = stream;
      setLocalStream(stream);
      setAudioEnabled(true);
      setVideoEnabled(true);
      setReady(true);

      return stream;
    } catch (err) {
      if (connectionIdRef.current !== capturedId) {
        throw new Error("Stale acquire call");
      }

      setReady(true);

      if (err instanceof DOMException && err.name === "NotAllowedError") {
        throw new Error("permission-denied");
      }
      if (err instanceof DOMException && err.name === "NotFoundError") {
        throw new Error("device-not-found");
      }
      throw err;
    }
  }, [networkTier, audioProcessing]);

  const toggleAudio = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    const newEnabled = !audioTrack.enabled;
    audioTrack.enabled = newEnabled;
    setAudioEnabled(newEnabled);
  }, []);

  const toggleVideo = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    const newEnabled = !videoTrack.enabled;
    videoTrack.enabled = newEnabled;
    setVideoEnabled(newEnabled);
  }, []);

  const toggleNoiseSuppression = useCallback(async () => {
    const stream = streamRef.current;
    const rawTrack = rawAudioTrackRef.current;
    if (!stream || !rawTrack) return;

    const newTrack = await audioProcessing.toggle(rawTrack);
    if (!newTrack) return;

    // Swap the audio track in the local stream
    const currentAudioTrack = stream.getAudioTracks()[0];
    if (currentAudioTrack) {
      // Preserve the enabled state
      newTrack.enabled = currentAudioTrack.enabled;
      stream.removeTrack(currentAudioTrack);
    }
    stream.addTrack(newTrack);

    // Notify peer connections to replace the track
    replaceTrackCallbackRef.current?.(newTrack);

    // Force React re-render with new stream reference
    setLocalStream(new MediaStream(stream.getTracks()));
    streamRef.current = stream;
  }, [audioProcessing]);

  const getLocalTracks = useCallback((): {
    tracks: MediaStreamTrack[];
    stream: MediaStream;
  } | null => {
    const stream = streamRef.current;
    if (!stream) return null;
    return { tracks: stream.getTracks(), stream };
  }, []);

  const release = useCallback(() => {
    audioProcessing.stopProcessing();
    rawAudioTrackRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLocalStream(null);
    setAudioEnabled(true);
    setVideoEnabled(true);
    setReady(false);
  }, [audioProcessing]);

  const setReplaceTrackCallback = useCallback(
    (cb: (track: MediaStreamTrack) => void) => {
      replaceTrackCallbackRef.current = cb;
    },
    [],
  );

  const value = useMemo<MediaContextValue>(
    () => ({
      localStream,
      audioEnabled,
      videoEnabled,
      ready,
      acquire,
      toggleAudio,
      toggleVideo,
      getLocalTracks,
      release,
      audioProcessing: audioProcessing.state,
      toggleNoiseSuppression,
      setReplaceTrackCallback,
    }),
    [
      localStream,
      audioEnabled,
      videoEnabled,
      ready,
      acquire,
      toggleAudio,
      toggleVideo,
      getLocalTracks,
      release,
      audioProcessing.state,
      toggleNoiseSuppression,
      setReplaceTrackCallback,
    ],
  );

  return (
    <MediaContext.Provider value={value}>{children}</MediaContext.Provider>
  );
};
