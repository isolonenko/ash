export const RECONNECT_BASE_DELAY = 1_000; // ms
export const RECONNECT_MAX_DELAY = 30_000; // ms

export const DATA_CHANNEL_LABEL = "thechat";

export const ICE_RESTART_MAX_ATTEMPTS = 2;

// ── WebRTC media quality ──────────────────────────────────
export const VIDEO_MAX_BITRATE = 2_500_000; // 2.5 Mbps — good for 720p
export const AUDIO_MAX_BITRATE = 48_000; // 48 kbps — richer voice quality over default ~32 kbps

// ── Audio processing pipeline ────────────────────────────
export const AUDIO_HIGHPASS_FREQUENCY = 85; // Hz — cuts rumble, HVAC, foot thumps
export const AUDIO_HIGHPASS_Q = 0.7071; // Butterworth (maximally flat passband)
export const AUDIO_COMPRESSOR_THRESHOLD = -28; // dBFS
export const AUDIO_COMPRESSOR_KNEE = 18; // dB — gentle transition
export const AUDIO_COMPRESSOR_RATIO = 3; // 3:1 — moderate compression
export const AUDIO_COMPRESSOR_ATTACK = 0.01; // seconds — fast onset capture
export const AUDIO_COMPRESSOR_RELEASE = 0.2; // seconds — natural tail
export const NOISE_GATE_THRESHOLD = 0.01; // RMS threshold (0-1)
export const NOISE_GATE_HYSTERESIS = 0.005; // RMS below threshold - hysteresis to prevent chattering
export const NOISE_GATE_HOLD_FRAMES = 10; // Number of frames to hold gate open after signal drops

// ── Room ──────────────────────────────────────────────────
export const MAX_ROOM_SIZE = 6;
export const SPEAKING_THRESHOLD = 0.01;
export const SPEAKING_CHECK_INTERVAL = 100; // ms
export const ROOM_CODE_LENGTH = 9;

// ── Adaptive bitrate ─────────────────────────────────────
export const STATS_POLL_INTERVAL = 2_000; // ms — poll getStats() every 2s
export const BITRATE_RAMP_DOWN = 0.75; // Multiply bitrate by 0.75 on congestion
export const BITRATE_RAMP_UP = 1.1; // Multiply bitrate by 1.1 when recovering
export const PACKET_LOSS_THRESHOLD = 0.05; // 5% packet loss triggers ramp-down
export const JITTER_THRESHOLD = 0.03; // 30ms jitter triggers ramp-down
export const RTT_THRESHOLD = 0.3; // 300ms RTT triggers ramp-down

// ── Network-aware quality tiers ──────────────────────────
export const BITRATE_TIERS = {
  high: { video: 2_500_000, width: 1280, height: 720, fps: 30 },
  medium: { video: 1_000_000, width: 640, height: 480, fps: 24 },
  low: { video: 400_000, width: 320, height: 240, fps: 15 },
} as const;
