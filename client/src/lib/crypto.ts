import * as ed from "@noble/ed25519";

// noble/ed25519 v3 requires hashes.sha512 to be set
import { sha512 } from "@noble/hashes/sha2.js";
ed.hashes.sha512 = (...msgs: Uint8Array[]) =>
  sha512(ed.etc.concatBytes(...msgs));

// ── Helpers ──────────────────────────────────────────────

const toBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

const fromBase64 = (str: string): Uint8Array =>
  Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

// ── Keypair ──────────────────────────────────────────────

export interface KeyPair {
  publicKey: string; // base64
  privateKey: string; // base64
}

export const generateKeyPair = (): KeyPair => {
  const privateKeyBytes = ed.utils.randomSecretKey();
  const publicKeyBytes = ed.getPublicKey(privateKeyBytes);

  return {
    publicKey: toBase64(publicKeyBytes),
    privateKey: toBase64(privateKeyBytes),
  };
};

// ── Signing ──────────────────────────────────────────────

export const sign = (message: string, privateKey: string): string => {
  const messageBytes = new TextEncoder().encode(message);
  const privateKeyBytes = fromBase64(privateKey);
  const signature = ed.sign(messageBytes, privateKeyBytes);
  return toBase64(signature);
};

export const verify = (
  message: string,
  signature: string,
  publicKey: string,
): boolean => {
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = fromBase64(signature);
  const publicKeyBytes = fromBase64(publicKey);
  return ed.verify(signatureBytes, messageBytes, publicKeyBytes);
};

// ── Utilities ────────────────────────────────────────────

export const generateId = (): string => crypto.randomUUID();

export const shortenKey = (publicKey: string): string =>
  publicKey.slice(0, 8) + "..." + publicKey.slice(-4);
