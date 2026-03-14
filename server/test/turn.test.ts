import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { createTurnRoutes } from "../src/routes/turn";
import type { Env } from "../src/env";

const makeRequest = async (envOverrides: Partial<Env>) => {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/turn-credentials", createTurnRoutes());
  return app.request("/turn-credentials", { method: "GET" }, envOverrides as Env);
};

describe("turn credentials", () => {
  it("returns 503 when TURN_SHARED_SECRET not set", async () => {
    const res = await makeRequest({ TURN_SHARED_SECRET: "", TURN_SERVER_URL: "" });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("TURN not configured");
  });

  it("returns valid credential structure", async () => {
    const res = await makeRequest({
      TURN_SHARED_SECRET: "test-secret-key",
      TURN_SERVER_URL: "turn:turn.example.com:3478",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.username).toBeTruthy();
    expect(body.credential).toBeTruthy();
    expect(body.ttl).toBe(86400);
    expect(body.uris).toHaveLength(2);
    expect(body.uris[0]).toBe("turn:turn.example.com:3478");
    expect(body.uris[1]).toBe("turn:turn.example.com:3478?transport=tcp");
  });

  it("username matches expected pattern", async () => {
    const res = await makeRequest({
      TURN_SHARED_SECRET: "test-secret-key",
      TURN_SERVER_URL: "turn:turn.example.com:3478",
    });
    const body = await res.json();
    expect(body.username).toMatch(/^\d+:thechat$/);
  });

  it("credential is valid base64", async () => {
    const res = await makeRequest({
      TURN_SHARED_SECRET: "test-secret-key",
      TURN_SERVER_URL: "",
    });
    const body = await res.json();
    expect(body.credential).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    expect(() => atob(body.credential)).not.toThrow();
  });

  it("HMAC-SHA1 credential is correct", async () => {
    const secret = "test-secret-key";
    const res = await makeRequest({
      TURN_SHARED_SECRET: secret,
      TURN_SERVER_URL: "",
    });
    const body = await res.json();

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body.username));
    const expected = btoa(String.fromCharCode(...new Uint8Array(signature)));

    expect(body.credential).toBe(expected);
  });

  it("returns empty uris when TURN_SERVER_URL not set", async () => {
    const res = await makeRequest({
      TURN_SHARED_SECRET: "test-secret-key",
      TURN_SERVER_URL: "",
    });
    const body = await res.json();
    expect(body.uris).toEqual([]);
  });
});
