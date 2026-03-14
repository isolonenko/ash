import { Hono } from "hono";
import type { Env } from "../env";

interface PresenceRecord {
  roomId: string;
  timestamp: number;
}

export const createPresenceRoutes = (): Hono<{ Bindings: Env }> => {
  const routes = new Hono<{ Bindings: Env }>();

  routes.post("/:publicKey", async (c) => {
    const publicKey = c.req.param("publicKey");
    const body = await c.req.json<{ roomId: string }>();

    if (!body.roomId) {
      return c.json({ error: "roomId is required" }, 400);
    }

    const record: PresenceRecord = {
      roomId: body.roomId,
      timestamp: Date.now(),
    };

    await c.env.PRESENCE.put(
      `presence:${publicKey}`,
      JSON.stringify(record),
      { expirationTtl: 300 },
    );

    return c.json({ ok: true });
  });

  routes.get("/:publicKey", async (c) => {
    const publicKey = c.req.param("publicKey");
    const raw = await c.env.PRESENCE.get(
      `presence:${publicKey}`,
      "json",
    ) as PresenceRecord | null;

    if (!raw) {
      return c.json({ online: false }, 404);
    }

    return c.json({
      online: true,
      roomId: raw.roomId,
      timestamp: raw.timestamp,
    });
  });

  routes.delete("/:publicKey", async (c) => {
    const publicKey = c.req.param("publicKey");
    await c.env.PRESENCE.delete(`presence:${publicKey}`);
    return c.json({ ok: true });
  });

  return routes;
};
