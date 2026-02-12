import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import type { ConnectionInvite } from "@shared/types";
import styles from "./QRScanner.module.scss";

interface QRScannerProps {
  onScan: (invite: ConnectionInvite) => void;
}

const parseInviteFromUrl = (input: string): ConnectionInvite | null => {
  try {
    // Handle full URL with hash fragment
    const hashMatch = input.match(/#\/connect\/(.+)$/);
    const encoded = hashMatch ? hashMatch[1] : input;
    const decoded = JSON.parse(atob(encoded));

    if (decoded.publicKey && decoded.roomId && decoded.signalingUrl) {
      return decoded as ConnectionInvite;
    }
    // Also support simplified invite (no roomId)
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
        () => {
          // Ignore scan failures (no QR found in frame)
        },
      )
      .catch(() => {
        // Camera access denied or unavailable
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
        <div className={styles.scanLine} />
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
