import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { Hono } from "hono";
import { createPresenceRoutes } from "../src/routes/presence";
import type { Env } from "../src/env";

const createApp = () => {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/presence", createPresenceRoutes());
  return app;
};

describe("presence routes", () => {
  it("POST /presence/:publicKey stores presence in KV", async () => {
    const app = createApp();
    const res = await app.request(
      "/presence/testkey123",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: "room-abc" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const stored = await env.PRESENCE.get("presence:testkey123", "json") as {
      roomId: string;
      timestamp: number;
    } | null;
    expect(stored).not.toBeNull();
    expect(stored!.roomId).toBe("room-abc");
    expect(stored!.timestamp).toBeGreaterThan(0);
  });

  it("POST /presence/:publicKey returns 400 when roomId missing", async () => {
    const app = createApp();
    const res = await app.request(
      "/presence/testkey123",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("roomId is required");
  });

  it("GET /presence/:publicKey returns online status when present", async () => {
    const app = createApp();

    await app.request(
      "/presence/testkey456",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: "room-xyz" }),
      },
      env,
    );

    const res = await app.request("/presence/testkey456", { method: "GET" }, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.online).toBe(true);
    expect(body.roomId).toBe("room-xyz");
    expect(body.timestamp).toBeGreaterThan(0);
  });

  it("GET /presence/:publicKey returns 404 when not present", async () => {
    const app = createApp();
    const res = await app.request("/presence/nonexistent", { method: "GET" }, env);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.online).toBe(false);
  });

  it("DELETE /presence/:publicKey removes presence", async () => {
    const app = createApp();

    await app.request(
      "/presence/testkey789",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: "room-del" }),
      },
      env,
    );

    const delRes = await app.request(
      "/presence/testkey789",
      { method: "DELETE" },
      env,
    );
    expect(delRes.status).toBe(200);

    const getRes = await app.request("/presence/testkey789", { method: "GET" }, env);
    expect(getRes.status).toBe(404);
  });
});
