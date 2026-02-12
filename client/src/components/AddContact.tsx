import { useState, useCallback } from "react";
import type { ConnectionInvite } from "@shared/types";
import { QRGenerator } from "./QRGenerator";
import { QRScanner } from "./QRScanner";
import styles from "./AddContact.module.scss";

interface AddContactProps {
  publicKey: string;
  onContactAdded: (peerPublicKey: string) => void;
  onClose: () => void;
}

type Tab = "share" | "scan";

export const AddContact = ({
  publicKey,
  onContactAdded,
  onClose,
}: AddContactProps) => {
  const [activeTab, setActiveTab] = useState<Tab>("share");

  const handleScan = useCallback(
    (invite: ConnectionInvite) => {
      onContactAdded(invite.publicKey);
    },
    [onContactAdded],
  );

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>Add Contact</div>
          <button className={styles.closeButton} onClick={onClose}>
            X
          </button>
        </div>

        <div className={styles.tabs}>
          <button
            className={
              activeTab === "share" ? styles.activeTab : styles.tab
            }
            onClick={() => setActiveTab("share")}
          >
            Share QR
          </button>
          <button
            className={
              activeTab === "scan" ? styles.activeTab : styles.tab
            }
            onClick={() => setActiveTab("scan")}
          >
            Scan / Paste
          </button>
        </div>

        <div className={styles.content}>
          {activeTab === "share" ? (
            <QRGenerator publicKey={publicKey} />
          ) : (
            <QRScanner onScan={handleScan} />
          )}
        </div>
      </div>
    </div>
  );
};
