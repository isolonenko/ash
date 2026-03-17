import { Hono } from "hono";
import { PresenceStore } from "../lib/presence-store.ts";

const PRESENCE_TTL_SECONDS = 300;

export const createPresenceRoutes = (store: PresenceStore): Hono => {
  const routes = new Hono();

  routes.post("/:publicKey", async (c) => {
    const publicKey = c.req.param("publicKey");
    const body = await c.req.json<{ roomId: string }>();

    if (!body.roomId) {
      return c.json({ error: "roomId is required" }, 400);
    }

    store.put(`presence:${publicKey}`, {
      roomId: body.roomId,
      timestamp: Date.now(),
    }, PRESENCE_TTL_SECONDS);

    return c.json({ ok: true });
  });

  routes.get("/:publicKey", (c) => {
    const publicKey = c.req.param("publicKey");
    const record = store.get(`presence:${publicKey}`);

    if (!record) {
      return c.json({ online: false }, 404);
    }

    return c.json({
      online: true,
      roomId: record.roomId,
      timestamp: record.timestamp,
    });
  });

  routes.delete("/:publicKey", (c) => {
    const publicKey = c.req.param("publicKey");
    store.delete(`presence:${publicKey}`);
    return c.json({ ok: true });
  });

  return routes;
};
