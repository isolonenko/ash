import { API_URL } from "@/lib/config";

interface TurnConfig {
  iceServers: RTCIceServer[];
  iceTransportPolicy: RTCIceTransportPolicy;
  bundlePolicy: RTCBundlePolicy;
  rtcpMuxPolicy: RTCRtcpMuxPolicy;
  iceCandidatePoolSize: number;
  degraded: boolean;
}

export const fetchTurnCredentials = async (): Promise<TurnConfig> => {
  try {
    const res = await fetch(`${API_URL}/turn-credentials`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      iceServers: [
        ...data.iceServers,
        { urls: "stun:stun.l.google.com:19302" },
      ],
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      iceCandidatePoolSize: 1,
      degraded: false,
    };
  } catch (err) {
    console.warn(
      "[TURN] Failed to fetch credentials — falling back to STUN only:",
      err,
    );
    return {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      iceCandidatePoolSize: 1,
      degraded: true,
    };
  }
};
