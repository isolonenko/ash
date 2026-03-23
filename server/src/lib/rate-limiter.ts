import type { Context, Next, MiddlewareHandler } from "hono";

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export function rateLimiter(options: RateLimitOptions): MiddlewareHandler {
  const { windowMs, max } = options;
  const clients = new Map<string, RateLimitEntry>();

  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of clients) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0) clients.delete(key);
    }
  }, 60_000);

  Deno.unrefTimer(sweepInterval);

  return async (c: Context, next: Next) => {
    const key =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const now = Date.now();

    let entry = clients.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      clients.set(key, entry);
    }

    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= max) {
      const oldestInWindow = entry.timestamps[0];
      const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "Too many requests" }, 429);
    }

    entry.timestamps.push(now);
    await next();
  };
}
