export const RECONNECT_BASE_DELAY = 1_000; // ms
export const RECONNECT_MAX_DELAY = 30_000; // ms

export const DATA_CHANNEL_LABEL = "thechat";

export const ICE_RESTART_MAX_ATTEMPTS = 2;

// ── WebRTC media quality ──────────────────────────────────
export const VIDEO_MAX_BITRATE = 2_500_000; // 2.5 Mbps — good for 720p
export const AUDIO_MAX_BITRATE = 48_000; // 48 kbps — richer voice quality over default ~32 kbps

// ── Room ──────────────────────────────────────────────────
export const MAX_ROOM_SIZE = 6;
export const SPEAKING_THRESHOLD = 0.01;
export const SPEAKING_CHECK_INTERVAL = 100; // ms
export const ROOM_CODE_LENGTH = 9;
