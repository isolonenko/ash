export const RECONNECT_BASE_DELAY = 1_000; // ms
export const RECONNECT_MAX_DELAY = 30_000; // ms

export const DATA_CHANNEL_LABEL = "thechat";

export const CONNECT_TIMEOUT = 15_000; // 15s — total time budget for connect()
export const SIGNALING_OPEN_TIMEOUT = 5_000; // 5s — max wait for WS onopen

export const ICE_RESTART_MAX_ATTEMPTS = 4;

// ── WebRTC media quality ──────────────────────────────────
export const VIDEO_MAX_BITRATE = 4_000_000; // 4 Mbps — good for 1080p
export const AUDIO_MAX_BITRATE = 96_000; // 96 kbps — rich voice quality

// ── Room ──────────────────────────────────────────────────
export const MAX_ROOM_SIZE = 6;
export const SPEAKING_THRESHOLD = 0.01;
export const SPEAKING_CHECK_INTERVAL = 100; // ms
export const ROOM_CODE_LENGTH = 9;

// ── Adaptive bitrate ─────────────────────────────────────
export const STATS_POLL_INTERVAL = 2_000;
export const BITRATE_RAMP_DOWN = 0.8;
export const BITRATE_RAMP_UP = 1.15;
export const PACKET_LOSS_THRESHOLD = 0.08;
export const JITTER_THRESHOLD = 0.05;
export const RTT_THRESHOLD = 0.4;

// ── Network-aware quality tiers ──────────────────────────
export const BITRATE_TIERS = {
  high: { video: 4_000_000, width: 1920, height: 1080, fps: 30 },
  medium: { video: 2_000_000, width: 1280, height: 720, fps: 24 },
  low: { video: 800_000, width: 640, height: 480, fps: 15 },
} as const;
