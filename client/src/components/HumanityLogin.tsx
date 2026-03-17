import { useHumanityAuth } from "@/hooks/useHumanityAuth";
import styles from "./HumanityLogin.module.sass";

interface HumanityLoginProps {
  onAuthenticated: (credential: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    userId: string;
    isHuman: boolean;
    verifiedAt?: number;
  }) => void;
  onSkip?: () => void;
}

export const HumanityLogin = ({
  onAuthenticated,
  onSkip,
}: HumanityLoginProps) => {
  const { state, credential, error, isConfigured, login, reset } =
    useHumanityAuth();

  if (state === "authenticated" && credential) {
    onAuthenticated(credential);
  }

  if (state === "processing") {
    return (
      <div className={styles.container}>
        <div className={styles.status}>
          <div className={styles.spinner} />
          <div className={styles.statusText}>verifying humanity...</div>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className={styles.container}>
        <div className={styles.errorBox}>
          <div className={styles.errorTitle}>Authentication Failed</div>
          <div className={styles.errorMessage}>{error}</div>
          <button className={styles.retryButton} onClick={reset}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (state === "redirecting") {
    return (
      <div className={styles.container}>
        <div className={styles.status}>
          <div className={styles.spinner} />
          <div className={styles.statusText}>redirecting to Humanity Protocol...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.description}>
        Verify your identity with Humanity Protocol to prove you're a real
        person. This is required before generating your cryptographic keypair.
      </div>

      <button
        className={styles.loginButton}
        onClick={login}
        disabled={!isConfigured}
      >
        {isConfigured
          ? "Verify with Humanity Protocol"
          : "HP Not Configured"}
      </button>

      {!isConfigured && (
        <div className={styles.hint}>
          Set VITE_HP_CLIENT_ID in .env to enable
        </div>
      )}

      {onSkip && (
        <button className={styles.skipButton} onClick={onSkip}>
          Skip for now
        </button>
      )}
    </div>
  );
};
