import { Hono } from "hono";
import type { Env } from "../env";

export const createSignalingRoutes = (): Hono<{ Bindings: Env }> => {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get("/:roomId", async (c) => {
    const roomId = c.req.param("roomId");
    const publicKey = c.req.query("publicKey") ?? "";

    // Deterministic DO ID — both peers connecting to same roomId
    // reach the exact same DO instance globally
    const id = c.env.SIGNALING_ROOM.idFromName(roomId);
    const stub = c.env.SIGNALING_ROOM.get(id);

    // Forward the request to the DO with roomId and publicKey as query params
    const url = new URL(c.req.url);
    url.searchParams.set("roomId", roomId);
    url.searchParams.set("publicKey", publicKey);

    return stub.fetch(new Request(url.toString(), c.req.raw));
  });

  return routes;
};
