import { useState } from "react";
import styles from "./RoomControls.module.sass";

interface RoomControlsProps {
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleChat: () => void;
  onLeaveRoom: () => void;
  onCopyLink: () => void;
  onTogglePip: () => void;
  onToggleNoiseSuppression: () => void;
  micEnabled: boolean;
  camEnabled: boolean;
  chatOpen: boolean;
  pipActive: boolean;
  pipSupported: boolean;
  roomCode: string;
  noiseSuppressionEnabled: boolean;
  noiseSuppressionLoading: boolean;
}

export const RoomControls = ({
  onToggleMic,
  onToggleCam,
  onToggleChat,
  onLeaveRoom,
  onCopyLink,
  onTogglePip,
  onToggleNoiseSuppression,
  micEnabled,
  camEnabled,
  chatOpen,
  pipActive,
  pipSupported,
  roomCode,
  noiseSuppressionEnabled,
  noiseSuppressionLoading,
}: RoomControlsProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.controlBar}>
      <div className={styles.roomInfo}>
        <span className={styles.roomCode}>{roomCode}</span>
        <button
          className={styles.copyButton}
          onClick={handleCopyLink}
          disabled={copied}
        >
          {copied ? "COPIED!" : "[COPY LINK]"}
        </button>
      </div>

      <div className={styles.controls}>
        <button
          className={micEnabled ? styles.buttonActive : styles.buttonInactive}
          onClick={onToggleMic}
        >
          {micEnabled ? "[MIC]" : "[MIC OFF]"}
        </button>

        <button
          className={camEnabled ? styles.buttonActive : styles.buttonInactive}
          onClick={onToggleCam}
        >
          {camEnabled ? "[CAM]" : "[CAM OFF]"}
        </button>

        <button
          className={
            noiseSuppressionEnabled
              ? styles.buttonNsActive
              : styles.buttonNsInactive
          }
          onClick={onToggleNoiseSuppression}
          disabled={noiseSuppressionLoading}
        >
          {noiseSuppressionLoading ? "[NS…]" : noiseSuppressionEnabled ? "[NS]" : "[NS OFF]"}
        </button>

        <button
          className={chatOpen ? styles.buttonChat : styles.buttonChatInactive}
          onClick={onToggleChat}
        >
          [CHAT]
        </button>

        {pipSupported && (
          <button
            className={pipActive ? styles.buttonActive : styles.buttonInactive}
            onClick={onTogglePip}
          >
            {pipActive ? "[PIP ON]" : "[PIP]"}
          </button>
        )}

        <button className={styles.buttonLeave} onClick={onLeaveRoom}>
          [LEAVE]
        </button>
      </div>
    </div>
  );
};
