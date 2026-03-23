import { Hono } from "hono";

export const createTurnRoutes = (
  domain: string,
  secret: string,
  ttl: number = 3600,
): Hono => {
  const routes = new Hono();

  routes.get("/", async (c) => {
    // No secret configured — return STUN-only (expected in local dev)
    if (!secret) {
      return c.json({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
    }

    const { username, credential } = await generateTurnCredentials(secret, ttl);

    return c.json({
      iceServers: [
        { urls: `stun:${domain}:3478` },
        { urls: `turn:${domain}:3478`, username, credential },
        { urls: `turns:${domain}:5349?transport=tcp`, username, credential },
      ],
    });
  });

  return routes;
};

async function generateTurnCredentials(
  secret: string,
  ttl: number,
): Promise<{ username: string; credential: string }> {
  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const username = `${timestamp}:thechat`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(username),
  );
  const credential = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return { username, credential };
}
