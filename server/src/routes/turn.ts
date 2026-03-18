import { Hono } from "hono";

export const createTurnRoutes = (domain: string, secret: string): Hono => {
  const routes = new Hono();

  routes.get("/", async (c) => {
    const { username, credential } = await generateTurnCredentials(secret);

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
): Promise<{ username: string; credential: string }> {
  const ttl = 86400; // 24 hours
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
