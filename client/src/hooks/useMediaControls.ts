import { useState, useCallback, useRef, useEffect } from "react";
import type { MediaStatePayload } from "@/types";

// ── Mesh interface (subset consumed by this hook) ────────

export interface MeshHandle {
  sendToAll: (msg: string) => void;
  addTrackToAll: (track: MediaStreamTrack, stream: MediaStream) => void;
  removeTrackFromAll: (sender: RTCRtpSender) => void;
}

// ── Types ────────────────────────────────────────────────

export interface UseMediaControlsResult {
  localStream: MediaStream | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  getPreviewStream: () => Promise<MediaStream>;
  toggleAudio: () => void;
  toggleVideo: () => void;
  addTracksToMesh: (mesh: MeshHandle) => void;
  removeTracksFromMesh: (mesh: MeshHandle) => void;
}

// ── Hook ─────────────────────────────────────────────────

export const useMediaControls = (): UseMediaControlsResult => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  const localStreamRef = useRef<MediaStream | null>(null);
  const sendersRef = useRef<RTCRtpSender[]>([]);
  const connectionIdRef = useRef(0);
  const meshRef = useRef<MeshHandle | null>(null);

  // Cleanup: stop all tracks on unmount
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    };
  }, []);

  // ── Broadcast media state via mesh DataChannel ─────────

  const broadcastMediaState = useCallback(
    (audio: boolean, video: boolean) => {
      const mesh = meshRef.current;
      if (!mesh) return;

      const payload: MediaStatePayload & { timestamp: number } = {
        audioEnabled: audio,
        videoEnabled: video,
        timestamp: Date.now(),
      };

      mesh.sendToAll(JSON.stringify({ type: "media-state" as const, ...payload }));
    },
    [],
  );

  // ── getPreviewStream ───────────────────────────────────

  const getPreviewStream = useCallback(async (): Promise<MediaStream> => {
    const capturedId = ++connectionIdRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });

      // Stale callback protection
      if (connectionIdRef.current !== capturedId) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("Stale getPreviewStream call");
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      setAudioEnabled(true);
      setVideoEnabled(true);

      return stream;
    } catch (err) {
      // Stale callback — don't update state
      if (connectionIdRef.current !== capturedId) {
        throw new Error("Stale getPreviewStream call");
      }

      if (err instanceof DOMException && err.name === "NotAllowedError") {
        throw new Error("permission-denied");
      }
      if (err instanceof DOMException && err.name === "NotFoundError") {
        throw new Error("device-not-found");
      }
      throw err;
    }
  }, []);

  // ── toggleAudio ────────────────────────────────────────

  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    const newEnabled = !audioTrack.enabled;
    audioTrack.enabled = newEnabled;
    setAudioEnabled(newEnabled);

    // Read video state from track directly to avoid stale closure
    const videoTrack = stream.getVideoTracks()[0];
    const currentVideoEnabled = videoTrack ? videoTrack.enabled : false;

    broadcastMediaState(newEnabled, currentVideoEnabled);
  }, [broadcastMediaState]);

  // ── toggleVideo ────────────────────────────────────────

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    const newEnabled = !videoTrack.enabled;
    videoTrack.enabled = newEnabled;
    setVideoEnabled(newEnabled);

    // Read audio state from track directly to avoid stale closure
    const audioTrack = stream.getAudioTracks()[0];
    const currentAudioEnabled = audioTrack ? audioTrack.enabled : true;

    broadcastMediaState(currentAudioEnabled, newEnabled);
  }, [broadcastMediaState]);

  // ── addTracksToMesh ────────────────────────────────────

  const addTracksToMesh = useCallback((mesh: MeshHandle) => {
    const stream = localStreamRef.current;
    if (!stream) return;

    meshRef.current = mesh;

    const newSenders: RTCRtpSender[] = [];
    stream.getTracks().forEach((track) => {
      mesh.addTrackToAll(track, stream);
    });

    sendersRef.current = newSenders;
  }, []);

  // ── removeTracksFromMesh ───────────────────────────────

  const removeTracksFromMesh = useCallback((mesh: MeshHandle) => {
    sendersRef.current.forEach((sender) => {
      mesh.removeTrackFromAll(sender);
    });
    sendersRef.current = [];
    meshRef.current = null;
  }, []);

  return {
    localStream,
    audioEnabled,
    videoEnabled,
    getPreviewStream,
    toggleAudio,
    toggleVideo,
    addTracksToMesh,
    removeTracksFromMesh,
  };
};
