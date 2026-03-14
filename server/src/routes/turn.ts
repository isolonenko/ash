import { Hono } from "hono";
import type { Env } from "../env";

export const createTurnRoutes = (): Hono<{ Bindings: Env }> => {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get("/", async (c) => {
    const sharedSecret = c.env.TURN_SHARED_SECRET;
    const turnServerUrl = c.env.TURN_SERVER_URL;

    if (!sharedSecret) {
      return c.json({ error: "TURN not configured" }, 503);
    }

    const ttl = 86400;
    const username = `${Math.floor(Date.now() / 1000) + ttl}:thechat`;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(sharedSecret),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(username),
    );

    const credential = btoa(
      String.fromCharCode(...new Uint8Array(signature)),
    );

    const uris = turnServerUrl
      ? [turnServerUrl, `${turnServerUrl}?transport=tcp`]
      : [];

    return c.json({ username, credential, ttl, uris });
  });

  return routes;
};
