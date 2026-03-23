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

interface MediaProviderProps {
  children: ReactNode;
}

export const MediaProvider = ({ children }: MediaProviderProps) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [ready, setReady] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const connectionIdRef = useRef(0);
  const networkTier = useNetworkQuality();

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
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
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (connectionIdRef.current !== capturedId) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("Stale acquire call");
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
  }, [networkTier]);

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

  const getLocalTracks = useCallback((): {
    tracks: MediaStreamTrack[];
    stream: MediaStream;
  } | null => {
    const stream = streamRef.current;
    if (!stream) return null;
    return { tracks: stream.getTracks(), stream };
  }, []);

  const release = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLocalStream(null);
    setAudioEnabled(true);
    setVideoEnabled(true);
    setReady(false);
  }, []);

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
    ],
  );

  return (
    <MediaContext.Provider value={value}>{children}</MediaContext.Provider>
  );
};
