import { useState, useCallback, type FormEvent } from "react";
import type { ConnectionInvite } from "@/types";
import { shortenKey } from "@/lib/crypto";
import { QRGenerator } from "./QRGenerator";
import { QRScanner } from "./QRScanner";
import styles from "./AddContact.module.scss";

interface AddContactProps {
  publicKey: string;
  onContactAdded: (peerPublicKey: string, name: string) => void;
  onClose: () => void;
}

type Tab = "share" | "scan";

export const AddContact = ({
  publicKey,
  onContactAdded,
  onClose,
}: AddContactProps) => {
  const [activeTab, setActiveTab] = useState<Tab>("share");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");

  const handleScan = useCallback((invite: ConnectionInvite) => {
    setPendingKey(invite.publicKey);
  }, []);

  const handleConfirmName = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (!pendingKey) return;
      onContactAdded(pendingKey, contactName.trim());
    },
    [pendingKey, contactName, onContactAdded],
  );

  const handleBack = useCallback(() => {
    setPendingKey(null);
    setContactName("");
  }, []);

  if (pendingKey) {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.header}>
            <div className={styles.title}>Name Contact</div>
            <button className={styles.closeButton} onClick={onClose}>
              X
            </button>
          </div>

          <form className={styles.nameForm} onSubmit={handleConfirmName}>
            <div className={styles.scannedKey}>
              <div className={styles.scannedKeyLabel}>public key</div>
              <div className={styles.scannedKeyValue}>
                {shortenKey(pendingKey)}
              </div>
            </div>

            <label className={styles.nameLabel} htmlFor="contact-name">
              display name
            </label>
            <input
              id="contact-name"
              className={styles.nameInput}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Enter a name for this contact..."
              autoFocus
            />

            <div className={styles.nameActions}>
              <button
                type="button"
                className={styles.backButton}
                onClick={handleBack}
              >
                Back
              </button>
              <button type="submit" className={styles.confirmButton}>
                {contactName.trim() ? "Add Contact" : "Skip Name"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

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
