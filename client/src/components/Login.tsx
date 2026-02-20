import { useState, useCallback } from "react";
import type { UserIdentity, HumanityCredential } from "@shared/types";
import { shortenKey } from "@/lib/crypto";
import { isHumanityConfigured } from "@/lib/humanity";
import { HumanityLogin } from "./HumanityLogin";
import styles from "./Login.module.scss";

type LoginStep = "hp-auth" | "generate" | "ready";

interface LoginProps {
  identity: UserIdentity | null;
  loading: boolean;
  isAuthenticated: boolean;
  onCreateIdentity: (credential?: HumanityCredential) => Promise<void>;
  onReady: () => void;
}

export const Login = ({
  identity,
  loading,
  isAuthenticated,
  onCreateIdentity,
  onReady,
}: LoginProps) => {
  const [step, setStep] = useState<LoginStep>(
    isAuthenticated ? "ready" : isHumanityConfigured() ? "hp-auth" : "generate",
  );
  const [hpCredential, setHpCredential] = useState<HumanityCredential | null>(
    null,
  );

  const handleHpAuthenticated = useCallback(
    (credential: HumanityCredential) => {
      setHpCredential(credential);
      setStep("generate");
    },
    [],
  );

  const handleGenerate = useCallback(async () => {
    await onCreateIdentity(hpCredential ?? undefined);
  }, [onCreateIdentity, hpCredential]);

  if (loading) {
    return (
      <div className={styles.login}>
        <div className={styles.logo}>TheChat</div>
        <div className={styles.tagline}>initializing...</div>
      </div>
    );
  }

  if ((isAuthenticated && identity) || step === "ready") {
    return (
      <div className={styles.login}>
        <div className={styles.logo}>TheChat</div>
        <div className={styles.tagline}>peer-to-peer encrypted messaging</div>

        <div className={styles.card}>
          <div className={styles.cardTitle}>Identity Loaded</div>

          <div className={styles.identity}>
            <div className={styles.identityLabel}>your public key</div>
            <div className={styles.identityKey}>
              {identity ? shortenKey(identity.publicKey) : "..."}
            </div>
          </div>

          {identity?.humanityCredential && (
            <div className={styles.hpBadge}>
              <span className={styles.hpBadgeIcon}>
                {identity.humanityCredential.isHuman ? "\u2713" : "?"}
              </span>
              <span>
                {identity.humanityCredential.isHuman
                  ? "Verified Human"
                  : "HP Connected"}
              </span>
            </div>
          )}

          <div className={styles.actions}>
            <button className={styles.button} onClick={onReady}>
              Enter Chat
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "hp-auth") {
    return (
      <div className={styles.login}>
        <div className={styles.logo}>TheChat</div>
        <div className={styles.tagline}>peer-to-peer encrypted messaging</div>

        <div className={styles.card}>
          <div className={styles.cardTitle}>Step 1: Verify Identity</div>
          <HumanityLogin
            onAuthenticated={handleHpAuthenticated}
            onSkip={() => setStep("generate")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.login}>
      <div className={styles.logo}>TheChat</div>
      <div className={styles.tagline}>peer-to-peer encrypted messaging</div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>
          {hpCredential ? "Step 2: Generate Identity" : "Generate Identity"}
        </div>
        <div className={styles.cardText}>
          Create a new Ed25519 keypair. This is your permanent identity for
          TheChat. It never leaves your device.
        </div>

        {hpCredential && (
          <div className={styles.hpBadge}>
            <span className={styles.hpBadgeIcon}>
              {hpCredential.isHuman ? "\u2713" : "?"}
            </span>
            <span>
              {hpCredential.isHuman
                ? "Verified Human"
                : "HP Connected"}
            </span>
          </div>
        )}

        <button className={styles.button} onClick={handleGenerate}>
          Generate Keypair
        </button>
      </div>
    </div>
  );
};
