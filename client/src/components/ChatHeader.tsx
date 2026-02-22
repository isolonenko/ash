import { useCallback } from "react";
import type { Contact, CallType } from "@/types";
import { useConnectionContext } from "@/context/ConnectionContext";
import { useCallContext } from "@/context/CallContext";
import { shortenKey } from "@/lib/crypto";
import styles from "./ChatWindow.module.scss";

interface ChatHeaderProps {
  contact: Contact;
  onBack?: () => void;
}

type StatusLabel = { text: string; className: string };

const getStatusLabel = (
  isConnectedToContact: boolean,
  isConnectingToContact: boolean,
  isConnecting: boolean,
  connectionState: string,
  connectedPeerKey: string | null,
  contactKey: string,
): StatusLabel => {
  if (isConnectedToContact) {
    return { text: "connected", className: styles.connected };
  }
  if (isConnectingToContact) {
    return { text: "connecting", className: styles.connecting };
  }
  if (isConnecting) {
    return { text: "looking up peer...", className: styles.connecting };
  }
  if (connectionState === "connected" && connectedPeerKey !== contactKey) {
    return { text: "connected elsewhere", className: styles.disconnected };
  }
  return { text: "", className: "" };
};

export const ChatHeader = ({ contact, onBack }: ChatHeaderProps) => {
  const {
    connectionState,
    connectedPeerKey,
    isConnecting,
    connectTo,
    disconnect,
  } = useConnectionContext();

  const { callState, startCall } = useCallContext();

  const isConnectedToThisContact =
    connectionState === "connected" && connectedPeerKey === contact.publicKey;

  const isConnectingToThisContact =
    connectionState === "connecting" && connectedPeerKey === contact.publicKey;

  const handleConnect = useCallback(async () => {
    await connectTo(contact.publicKey);
  }, [contact.publicKey, connectTo]);

  const handleStartCall = useCallback(
    async (type: CallType) => {
      await startCall(type);
    },
    [startCall],
  );

  const showConnectButton =
    !isConnectedToThisContact && !isConnectingToThisContact && !isConnecting;

  const status = getStatusLabel(
    isConnectedToThisContact,
    isConnectingToThisContact,
    isConnecting,
    connectionState,
    connectedPeerKey,
    contact.publicKey,
  );

  return (
    <div className={styles.header}>
      {onBack && (
        <button className={styles.backButton} onClick={onBack}>
          {"<"}
        </button>
      )}

      <span className={styles.contactName}>
        {contact.name || shortenKey(contact.publicKey)}
      </span>

      {showConnectButton ? (
        <button className={styles.connectButton} onClick={handleConnect}>
          Connect P2P
        </button>
      ) : (
        <>
          <span className={status.className}>{status.text}</span>
          {isConnectedToThisContact && callState === "idle" && (
            <>
              <button
                className={styles.callButton}
                onClick={() => handleStartCall("audio")}
              >
                [CALL]
              </button>
              <button
                className={styles.videoCallButton}
                onClick={() => handleStartCall("video")}
              >
                [VIDEO]
              </button>
            </>
          )}
          {isConnectedToThisContact && (
            <button className={styles.connectButton} onClick={disconnect}>
              Disconnect
            </button>
          )}
        </>
      )}
    </div>
  );
};
