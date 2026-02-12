import type { UserIdentity } from "@shared/types";
import { shortenKey } from "@/lib/crypto";
import styles from "./Login.module.scss";

interface LoginProps {
  identity: UserIdentity | null;
  loading: boolean;
  isAuthenticated: boolean;
  onCreateIdentity: () => Promise<void>;
  onReady: () => void;
}

export const Login = ({
  identity,
  loading,
  isAuthenticated,
  onCreateIdentity,
  onReady,
}: LoginProps) => {
  if (loading) {
    return (
      <div className={styles.login}>
        <div className={styles.logo}>TheChat</div>
        <div className={styles.tagline}>initializing...</div>
      </div>
    );
  }

  if (isAuthenticated && identity) {
    return (
      <div className={styles.login}>
        <div className={styles.logo}>TheChat</div>
        <div className={styles.tagline}>peer-to-peer encrypted messaging</div>

        <div className={styles.card}>
          <div className={styles.cardTitle}>Identity Loaded</div>

          <div className={styles.identity}>
            <div className={styles.identityLabel}>your public key</div>
            <div className={styles.identityKey}>
              {shortenKey(identity.publicKey)}
            </div>
          </div>

          <div className={styles.actions}>
            <button className={styles.button} onClick={onReady}>
              Enter Chat
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.login}>
      <div className={styles.logo}>TheChat</div>
      <div className={styles.tagline}>peer-to-peer encrypted messaging</div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Generate Identity</div>
        <div className={styles.cardText}>
          Create a new Ed25519 keypair. This is your permanent identity for
          TheChat. It never leaves your device.
        </div>

        <button className={styles.button} onClick={onCreateIdentity}>
          Generate Keypair
        </button>
      </div>
    </div>
  );
};
