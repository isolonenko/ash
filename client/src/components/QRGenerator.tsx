import { useMemo, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { ConnectionInvite } from "@/types";
import styles from "./QRGenerator.module.scss";

interface QRGeneratorProps {
  publicKey: string;
}

const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL || "ws://localhost:8080";
const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;

export const QRGenerator = ({ publicKey }: QRGeneratorProps) => {
  const [copied, setCopied] = useState(false);

  const invite: ConnectionInvite = useMemo(
    () => ({
      publicKey,
      signalingUrl: SIGNALING_URL,
    }),
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

  return (
    <div className={styles.container}>
      <div className={styles.qrWrapper}>
        <QRCodeSVG value={link} size={200} level="M" />
      </div>

      <div className={styles.linkSection}>
        <div className={styles.label}>shareable link</div>
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
      </div>

      <div className={styles.info}>
        Scan this QR code or share the link to connect
      </div>
    </div>
  );
};
