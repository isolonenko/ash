import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { Hono } from "hono";
import { createTurnRoutes } from "./turn.ts";

const TEST_SECRET = "test-secret-key-for-hmac";
const TEST_DOMAIN = "chat.example.com";

const createApp = () => {
  const app = new Hono();
  app.route("/turn-credentials", createTurnRoutes(TEST_DOMAIN, TEST_SECRET));
  return app;
};

describe("TURN credential routes", () => {
  it("GET / returns iceServers array with stun and turn entries", async () => {
    const app = createApp();
    const res = await app.request("/turn-credentials");

    assertEquals(res.status, 200);

    const body = await res.json();
    assertEquals(Array.isArray(body.iceServers), true);
    assertEquals(body.iceServers.length, 3);

    // First entry: STUN
    assertEquals(body.iceServers[0].urls, `stun:${TEST_DOMAIN}:3478`);

    // Second entry: TURN UDP
    assertEquals(body.iceServers[1].urls, `turn:${TEST_DOMAIN}:3478`);
    assertEquals(typeof body.iceServers[1].username, "string");
    assertEquals(typeof body.iceServers[1].credential, "string");

    // Third entry: TURNS TCP (port 5349)
    assertEquals(body.iceServers[2].urls, `turns:${TEST_DOMAIN}:5349?transport=tcp`);
  });

  it("credential username contains a future timestamp", async () => {
    const app = createApp();
    const res = await app.request("/turn-credentials");
    const body = await res.json();

    const username = body.iceServers[1].username as string;
    const [timestampStr, label] = username.split(":");
    const timestamp = parseInt(timestampStr, 10);

    // Timestamp should be in the future (now + 24h)
    const now = Math.floor(Date.now() / 1000);
    assertEquals(timestamp > now, true);
    assertEquals(timestamp <= now + 86400 + 5, true); // 24h + small tolerance
    assertEquals(label, "thechat");
  });

  it("credential is a valid base64 string", async () => {
    const app = createApp();
    const res = await app.request("/turn-credentials");
    const body = await res.json();

    const credential = body.iceServers[1].credential as string;
    // Base64 regex: only valid base64 characters
    assertEquals(/^[A-Za-z0-9+/]+=*$/.test(credential), true);
  });

  it("all TURN entries share the same username and credential", async () => {
    const app = createApp();
    const res = await app.request("/turn-credentials");
    const body = await res.json();

    const turn1 = body.iceServers[1];
    const turn2 = body.iceServers[2];
    assertEquals(turn1.username, turn2.username);
    assertEquals(turn1.credential, turn2.credential);
  });
});
