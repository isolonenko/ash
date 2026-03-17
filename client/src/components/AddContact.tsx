import { useState, useCallback, useMemo, type FormEvent } from "react";
import type { ConnectionInvite } from "@/types";
import { shortenKey } from "@/lib/crypto";
import styles from "./AddContact.module.sass";

interface AddContactProps {
  publicKey: string;
  onContactAdded: (peerPublicKey: string, name: string) => void;
  onClose: () => void;
}

const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL || "ws://localhost:8080";
const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;

const parseInviteFromUrl = (input: string): ConnectionInvite | null => {
  try {
    const hashMatch = input.match(/#\/connect\/(.+)$/);
    const encoded = hashMatch ? decodeURIComponent(hashMatch[1]) : input;
    const decoded = JSON.parse(atob(encoded));

    if (decoded.publicKey && decoded.signalingUrl) {
      return decoded as ConnectionInvite;
    }
    return null;
  } catch {
    return null;
  }
};

export const AddContact = ({
  publicKey,
  onContactAdded,
  onClose,
}: AddContactProps) => {
  const [pasteValue, setPasteValue] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");

  const invite: ConnectionInvite = useMemo(
    () => ({ publicKey, signalingUrl: SIGNALING_URL }),
    [publicKey],
  );

  const encoded = useMemo(
    () => btoa(JSON.stringify(invite)),
    [invite],
  );

  const link = useMemo(
    () => `${APP_URL}/#/connect/${encodeURIComponent(encoded)}`,
    [encoded],
  );

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [link]);

  const handlePasteConnect = useCallback(() => {
    const parsed = parseInviteFromUrl(pasteValue.trim());
    if (parsed) {
      setPendingKey(parsed.publicKey);
      setPasteError(null);
    } else {
      setPasteError("Invalid connection link");
    }
  }, [pasteValue]);

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

  // ── Name Contact view ─────────────────────────────────────

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

  // ── Main view: Your Link + Their Link ─────────────────────

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>Add Contact</div>
          <button className={styles.closeButton} onClick={onClose}>
            X
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Your Link</div>
            <div className={styles.linkBox}>
              <input
                className={styles.linkInput}
                value={link}
                readOnly
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                className={copied ? styles.copied : styles.copyButton}
                onClick={handleCopy}
              >
                {copied ? "copied" : "copy"}
              </button>
            </div>
            <div className={styles.hint}>
              Share this link so others can connect to you
            </div>
          </div>

          <div className={styles.divider}>or</div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Their Link</div>
            <input
              className={`${styles.pasteInput} ${pasteError ? styles.pasteInputError : ""}`}
              value={pasteValue}
              onChange={(e) => {
                setPasteValue(e.target.value);
                setPasteError(null);
              }}
              placeholder="Paste connection link..."
            />
            {pasteError && (
              <div className={styles.pasteErrorText}>{pasteError}</div>
            )}
            <button
              className={styles.connectButton}
              onClick={handlePasteConnect}
              disabled={!pasteValue.trim()}
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
