// ── Centralized server URLs ─────────────────────────────
// Derived from VITE_SIGNALING_URL env var, with sensible defaults.

export const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL || "ws://localhost:8000";

export const API_URL = SIGNALING_URL.replace(/^ws/, "http");
