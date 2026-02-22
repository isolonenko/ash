import { useState, useEffect, useCallback } from "react";
import type { HumanityCredential } from "@/types";
import {
  isHumanityConfigured,
  startHumanityLogin,
  handleHumanityCallback,
  parseOAuthCallback,
  clearOAuthParams,
} from "@/lib/humanity";

export type HumanityAuthState =
  | "idle"
  | "redirecting"
  | "processing"
  | "authenticated"
  | "error";

interface UseHumanityAuthResult {
  state: HumanityAuthState;
  credential: HumanityCredential | null;
  error: string | null;
  isConfigured: boolean;
  login: () => void;
  reset: () => void;
}

export const useHumanityAuth = (): UseHumanityAuthResult => {
  const [state, setState] = useState<HumanityAuthState>("idle");
  const [credential, setCredential] = useState<HumanityCredential | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const configured = isHumanityConfigured();

  useEffect(() => {
    const callback = parseOAuthCallback();
    if (!callback) return;

    setState("processing");
    clearOAuthParams();

    handleHumanityCallback(callback.code, callback.state)
      .then((result) => {
        setCredential(result.credential);
        setState("authenticated");
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Authentication failed";
        setError(message);
        setState("error");
      });
  }, []);

  const login = useCallback(() => {
    setState("redirecting");
    startHumanityLogin();
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setCredential(null);
    setError(null);
  }, []);

  return {
    state,
    credential,
    error,
    isConfigured: configured,
    login,
    reset,
  };
};
