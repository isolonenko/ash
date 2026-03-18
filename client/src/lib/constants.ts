export const PRESENCE_PUBLISH_INTERVAL = 120_000; // ms
export const PRESENCE_RETRY_ATTEMPTS = 3;
export const PRESENCE_RETRY_BASE_DELAY = 1_000; // ms

export const CONNECT_RETRY_ATTEMPTS = 4;
export const CONNECT_RETRY_DELAY = 2_000; // ms
export const RELISTEN_DELAY = 100; // ms

export const RECONNECT_BASE_DELAY = 1_000; // ms
export const RECONNECT_MAX_DELAY = 30_000; // ms

export const FILE_CHUNK_SIZE = 16 * 1024; // bytes
export const FILE_CHUNK_BATCH_SIZE = 10;
export const FILE_CHUNK_BATCH_DELAY = 10; // ms

export const DATA_CHANNEL_LABEL = "thechat";

export const TYPING_DEBOUNCE_MS = 2_000; // ms

export const CALL_MEDIA_TIMEOUT_MS = 15_000; // ms — max wait for remote media tracks after call becomes active
export const ICE_RESTART_MAX_ATTEMPTS = 2;

// ── WebRTC media quality ─────────────────────────────────
export const VIDEO_MAX_BITRATE = 2_500_000; // 2.5 Mbps — good for 720p
export const AUDIO_MAX_BITRATE = 48_000; // 48 kbps — richer voice quality over default ~32 kbps
