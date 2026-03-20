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

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const acquire = useCallback(async (): Promise<MediaStream> => {
    const capturedId = ++connectionIdRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
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
  }, []);

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

  const getLocalTracks = useCallback(
    (): { tracks: MediaStreamTrack[]; stream: MediaStream } | null => {
      const stream = streamRef.current;
      if (!stream) return null;
      return { tracks: stream.getTracks(), stream };
    },
    [],
  );

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
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
    [localStream, audioEnabled, videoEnabled, ready, acquire, toggleAudio, toggleVideo, getLocalTracks, release],
  );

  return (
    <MediaContext.Provider value={value}>
      {children}
    </MediaContext.Provider>
  );
};
