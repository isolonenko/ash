import { useState } from "react";
import { DeviceDropdown } from "./DeviceDropdown";
import styles from "./RoomControls.module.sass";

interface RoomControlsProps {
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleChat: () => void;
  onLeaveRoom: () => void;
  onCopyLink: () => void;
  onTogglePip: () => void;
  micEnabled: boolean;
  camEnabled: boolean;
  chatOpen: boolean;
  pipActive: boolean;
  pipSupported: boolean;
  roomCode: string;
  callDuration: string | null;
}

export const RoomControls = ({
  onToggleMic,
  onToggleCam,
  onToggleChat,
  onLeaveRoom,
  onCopyLink,
  onTogglePip,
  micEnabled,
  camEnabled,
  chatOpen,
  pipActive,
  pipSupported,
  roomCode,
  callDuration,
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
        {callDuration && <span className={styles.duration}>{callDuration}</span>}
        <button
          className={styles.copyButton}
          onClick={handleCopyLink}
          disabled={copied}
        >
          {copied ? "COPIED!" : "[COPY LINK]"}
        </button>
      </div>

      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <button
            className={micEnabled ? styles.buttonActive : styles.buttonInactive}
            onClick={onToggleMic}
          >
            {micEnabled ? "[MIC]" : "[MIC OFF]"}
          </button>
          <DeviceDropdown kind="audio" direction="up" />
        </div>

        <div className={styles.controlGroup}>
          <button
            className={camEnabled ? styles.buttonActive : styles.buttonInactive}
            onClick={onToggleCam}
          >
            {camEnabled ? "[CAM]" : "[CAM OFF]"}
          </button>
          <DeviceDropdown kind="video" direction="up" />
        </div>

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
