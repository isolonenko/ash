export interface PresenceRecord {
  roomId: string;
  timestamp: number;
}

interface StoredEntry {
  record: PresenceRecord;
  expiresAt: number;
}

export class PresenceStore {
  private store = new Map<string, StoredEntry>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(cleanupIntervalMs = 60_000) {
    this.cleanupTimer = setInterval(() => this.sweep(), cleanupIntervalMs);
  }

  put(key: string, record: PresenceRecord, ttlSeconds: number): void {
    this.store.set(key, {
      record,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  get(key: string): PresenceRecord | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.record;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Remove all expired entries. Called automatically via setInterval. */
  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  /** Stop the cleanup interval. Call when shutting down. */
  destroy(): void {
    clearInterval(this.cleanupTimer);
  }
}
