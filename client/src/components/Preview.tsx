import { useState, useEffect, useCallback } from "react";
import { useRoomContext } from "@/context/room-context";
import { useMediaControls } from "@/hooks/useMediaControls";
import { navigateTo } from "@/lib/router";
import styles from "./Preview.module.sass";

interface PreviewProps {
  roomId: string;
}

export const Preview = ({ roomId }: PreviewProps) => {
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { checkRoom, joinRoom } = useRoomContext();
  const {
    localStream,
    audioEnabled,
    videoEnabled,
    getPreviewStream,
    toggleAudio,
    toggleVideo,
  } = useMediaControls();

  // ── Video ref callback (EXACT pattern from CallOverlay.tsx:31-38) ─

  const videoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      if (node && localStream) {
        node.srcObject = localStream;
        node.autoplay = true;
        node.muted = true;
        node.playsInline = true;
      }
    },
    [localStream],
  );

  // ── Room validation on mount ─────────────────────────────────────

  useEffect(() => {
    const validateRoom = async () => {
      try {
        await checkRoom(roomId);
      } catch {
        setError("Room not found or full");
        return;
      }

      // Camera failure should NOT block preview — just show placeholder
      try {
        await getPreviewStream();
      } catch {
        // Silently fail — user sees "CAMERA OFF" placeholder
      }
    };

    validateRoom();
  }, [roomId, checkRoom, getPreviewStream]);

  // ── Join handler ─────────────────────────────────────────────────

  const handleJoin = async () => {
    if (!displayName.trim()) return;

    try {
      await joinRoom(roomId, displayName.trim(), { audioEnabled, videoEnabled });
    } catch {
      setError("Failed to join room");
    }
  };

  // ── Error state ──────────────────────────────────────────────────

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorContainer}>
          <div className={styles.errorMessage}>{error}</div>
          <button
            className={styles.backButton}
            onClick={() => navigateTo({ page: "landing" })}
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ── Preview UI ───────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.roomCode}>Room: {roomId}</div>
      </header>

      <div className={styles.previewSection}>
        <div className={styles.videoContainer}>
          {videoEnabled && localStream ? (
            <video ref={videoRef} className={styles.video} />
          ) : (
            <div className={styles.videoPlaceholder}>
              <div className={styles.placeholderText}>CAMERA OFF</div>
            </div>
          )}
        </div>

        <input
          type="text"
          className={styles.nameInput}
          placeholder="Enter your name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          spellCheck={false}
          autoComplete="off"
        />

        <div className={styles.controls}>
          <button
            className={
              audioEnabled ? styles.buttonActive : styles.buttonInactive
            }
            onClick={toggleAudio}
          >
            {audioEnabled ? "[MIC]" : "[MIC OFF]"}
          </button>

          <button
            className={
              videoEnabled ? styles.buttonActive : styles.buttonInactive
            }
            onClick={toggleVideo}
          >
            {videoEnabled ? "[CAM]" : "[CAM OFF]"}
          </button>
        </div>

        <button
          className={styles.joinButton}
          onClick={handleJoin}
          disabled={!displayName.trim()}
        >
          [JOIN]
        </button>
      </div>
    </div>
  );
};
