// ── TURN Credentials Runtime Fetcher ────────────────────

const CREDENTIALS_URL =
  import.meta.env.VITE_SIGNALING_URL?.replace(/^ws/, "http") ||
  "http://localhost:8080";

interface TurnConfig {
  iceServers: RTCIceServer[];
  iceTransportPolicy: RTCIceTransportPolicy;
}

export const fetchTurnCredentials = async (): Promise<TurnConfig> => {
  // Try to fetch from signaling server
  try {
    const res = await fetch(`${CREDENTIALS_URL}/turn-credentials`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: data.uris, username: data.username, credential: data.credential },
      ],
      iceTransportPolicy: "all",
    };
  } catch (err) {
    const isProduction = !!import.meta.env.VITE_SIGNALING_URL;
    if (isProduction) {
      console.warn("[TURN] Failed to fetch credentials — falling back to STUN only:", err);
      return {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        iceTransportPolicy: "all",
      };
    }
    // Local dev fallback: coturn from docker compose
    return {
      iceServers: [
        {
          urls: ["turn:127.0.0.1:3478", "turn:127.0.0.1:3478?transport=tcp"],
          username: "thechat",
          credential: "thechat",
        },
      ],
      iceTransportPolicy: "relay",
    };
  }
};
