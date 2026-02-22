import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import type { ConnectionInvite } from "@/types";
import styles from "./QRScanner.module.scss";

interface QRScannerProps {
  onScan: (invite: ConnectionInvite) => void;
}

type CameraState = "loading" | "active" | "error";

const parseInviteFromUrl = (input: string): ConnectionInvite | null => {
  try {
    const hashMatch = input.match(/#\/connect\/(.+)$/);
    const encoded = hashMatch ? hashMatch[1] : input;
    const decoded = JSON.parse(atob(encoded));

    if (decoded.publicKey && decoded.roomId && decoded.signalingUrl) {
      return decoded as ConnectionInvite;
    }
    if (decoded.publicKey && decoded.signalingUrl) {
      return decoded as ConnectionInvite;
    }
    return null;
  } catch {
    return null;
  }
};

export const QRScanner = ({ onScan }: QRScannerProps) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pasteValue, setPasteValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("loading");

  useEffect(() => {
    if (!containerRef.current) return;

    const scannerId = "qr-scanner-" + Date.now();
    containerRef.current.id = scannerId;

    const scanner = new Html5Qrcode(scannerId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          const invite = parseInviteFromUrl(decodedText);
          if (invite) {
            scanner.stop();
            onScan(invite);
          }
        },
        () => {},
      )
      .then(() => {
        setCameraState("active");
      })
      .catch(() => {
        setCameraState("error");
        setError("Camera unavailable. Use the link input below.");
      });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, [onScan]);

  const handlePasteConnect = useCallback(() => {
    const invite = parseInviteFromUrl(pasteValue.trim());
    if (invite) {
      onScan(invite);
    } else {
      setError("Invalid connection link");
    }
  }, [pasteValue, onScan]);

  return (
    <div className={styles.container}>
      <div className={styles.scannerWrapper}>
        <div ref={containerRef} />
        {cameraState === "loading" && (
          <div className={styles.cameraOverlay}>
            <div className={styles.spinner} />
            <span>Accessing camera…</span>
          </div>
        )}
        {cameraState === "error" && (
          <div className={styles.cameraOverlay}>
            <span className={styles.cameraErrorIcon}>⚠</span>
            <span>Camera unavailable</span>
            <span className={styles.cameraHint}>
              Check permissions or use the link input below
            </span>
          </div>
        )}
        {cameraState === "active" && <div className={styles.scanLine} />}
      </div>

      <div className={styles.divider}>or paste link</div>

      <div className={styles.pasteSection}>
        <label className={styles.label}>connection link</label>
        <input
          className={styles.pasteInput}
          value={pasteValue}
          onChange={(e) => {
            setPasteValue(e.target.value);
            setError(null);
          }}
          placeholder="Paste connection link here..."
        />
        <button
          className={styles.connectButton}
          onClick={handlePasteConnect}
          disabled={!pasteValue.trim()}
        >
          Connect
        </button>
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </div>
  );
};
