import { Hono } from "hono";

interface PresenceRecord {
  roomId: string;
  timestamp: number;
}

const PRESENCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const presenceStore = new Map<string, PresenceRecord>();

const evictStale = (): void => {
  const now = Date.now();
  for (const [key, record] of presenceStore) {
    if (now - record.timestamp > PRESENCE_TTL_MS) {
      presenceStore.delete(key);
    }
  }
};

// Run eviction every 60 seconds
setInterval(evictStale, 60_000);

export const createPresenceRoutes = (): Hono => {
  const routes = new Hono();

  // Publish presence: POST /presence/:publicKey
  routes.post("/:publicKey", async (c) => {
    const publicKey = c.req.param("publicKey");
    const body = await c.req.json<{ roomId: string }>();

    if (!body.roomId) {
      return c.json({ error: "roomId is required" }, 400);
    }

    presenceStore.set(publicKey, {
      roomId: body.roomId,
      timestamp: Date.now(),
    });

    return c.json({ ok: true });
  });

  // Lookup presence: GET /presence/:publicKey
  routes.get("/:publicKey", (c) => {
    const publicKey = c.req.param("publicKey");
    const record = presenceStore.get(publicKey);

    if (!record || Date.now() - record.timestamp > PRESENCE_TTL_MS) {
      presenceStore.delete(publicKey);
      return c.json({ online: false }, 404);
    }

    return c.json({
      online: true,
      roomId: record.roomId,
      timestamp: record.timestamp,
    });
  });

  // Delete presence: DELETE /presence/:publicKey
  routes.delete("/:publicKey", (c) => {
    const publicKey = c.req.param("publicKey");
    presenceStore.delete(publicKey);
    return c.json({ ok: true });
  });

  return routes;
};
