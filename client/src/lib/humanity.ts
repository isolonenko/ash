import {
  HumanitySDK,
  type TokenResult,
  type PresetCheckResult,
} from "@humanity-org/connect-sdk";
import type { HumanityCredential } from "@/types";

// ── Config ───────────────────────────────────────────────

const CLIENT_ID = import.meta.env.VITE_HP_CLIENT_ID as string | undefined;
const REDIRECT_URI =
  (import.meta.env.VITE_HP_REDIRECT_URI as string | undefined) ??
  `${window.location.origin}${window.location.pathname}`;
const ENVIRONMENT =
  (import.meta.env.VITE_HP_ENVIRONMENT as string | undefined) ?? "production";

const STORAGE_PREFIX = "hp_";
const VERIFIER_KEY = `${STORAGE_PREFIX}code_verifier`;
const STATE_KEY = `${STORAGE_PREFIX}state`;

// ── SDK instance ─────────────────────────────────────────

let sdk: HumanitySDK | null = null;

const getSdk = (): HumanitySDK => {
  if (!sdk) {
    if (!CLIENT_ID) {
      throw new Error(
        "VITE_HP_CLIENT_ID is not set. Configure it in .env to enable Humanity Protocol login.",
      );
    }
    sdk = new HumanitySDK({
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      environment: ENVIRONMENT,
    });
  }
  return sdk;
};

export const isHumanityConfigured = (): boolean => !!CLIENT_ID;

// ── OAuth Flow ───────────────────────────────────────────

export const startHumanityLogin = (): void => {
  const hp = getSdk();

  const state = HumanitySDK.generateState();
  const { url, codeVerifier } = hp.buildAuthUrl({
    scopes: ["isHuman"],
    state,
  });

  sessionStorage.setItem(VERIFIER_KEY, codeVerifier);
  sessionStorage.setItem(STATE_KEY, state);

  window.location.href = url;
};

export interface HumanityCallbackResult {
  credential: HumanityCredential;
  tokens: TokenResult;
}

export const handleHumanityCallback = async (
  code: string,
  state: string,
): Promise<HumanityCallbackResult> => {
  const hp = getSdk();

  const storedState = sessionStorage.getItem(STATE_KEY);
  const codeVerifier = sessionStorage.getItem(VERIFIER_KEY);

  if (!storedState || !HumanitySDK.verifyState(storedState, state)) {
    throw new Error("Invalid state — possible CSRF attack");
  }

  if (!codeVerifier) {
    throw new Error("Missing code verifier — restart login flow");
  }

  const tokens = await hp.exchangeCodeForToken({ code, codeVerifier });

  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);

  let isHuman = false;
  let verifiedAt: number | undefined;
  try {
    const check: PresetCheckResult = await hp.verifyPreset({
      preset: "isHuman",
      accessToken: tokens.accessToken,
    });
    isHuman = check.value === true;
    verifiedAt = check.verifiedAt ? new Date(check.verifiedAt).getTime() : undefined;
  } catch {
    isHuman = false;
  }

  const credential: HumanityCredential = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
    userId: tokens.appScopedUserId,
    isHuman,
    verifiedAt,
  };

  return { credential, tokens };
};

// ── Callback URL detection ───────────────────────────────

export const parseOAuthCallback = (): {
  code: string;
  state: string;
} | null => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");

  if (code && state) {
    return { code, state };
  }
  return null;
};

export const clearOAuthParams = (): void => {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState(null, "", url.pathname + url.hash);
};
