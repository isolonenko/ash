// ── TURN Credentials Runtime Fetcher ────────────────────

const CREDENTIALS_URL =
  import.meta.env.VITE_SIGNALING_URL?.replace(/^ws/, "http") ||
  "http://localhost:8080";

interface TurnConfig {
  iceServers: RTCIceServer[];
  iceTransportPolicy: RTCIceTransportPolicy;
}

export const fetchTurnCredentials = async (): Promise<TurnConfig> => {
  try {
    const res = await fetch(`${CREDENTIALS_URL}/turn-credentials`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      iceServers: [
        ...data.iceServers,
        { urls: "stun:stun.l.google.com:19302" },
      ],
      iceTransportPolicy: "all",
    };
  } catch (err) {
    console.warn("[TURN] Failed to fetch credentials — falling back to STUN only:", err);
    return {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      iceTransportPolicy: "all",
    };
  }
};
