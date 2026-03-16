import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createTurnRoutes } from "../src/routes/turn";
import type { Env } from "../src/env";

const MOCK_ICE_SERVERS = [
  { urls: "stun:a.relay.metered.ca:80" },
  { urls: "turn:a.relay.metered.ca:80", username: "abc123", credential: "def456" },
  { urls: "turn:a.relay.metered.ca:443", username: "abc123", credential: "def456" },
  { urls: "turn:a.relay.metered.ca:443?transport=tcp", username: "abc123", credential: "def456" },
];

const makeRequest = async (envOverrides: Partial<Env>) => {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/turn-credentials", createTurnRoutes());
  return app.request("/turn-credentials", { method: "GET" }, envOverrides as Env);
};

describe("turn credentials (metered proxy)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 503 when METERED_API_KEY not set", async () => {
    const res = await makeRequest({ METERED_API_KEY: "", METERED_APP_NAME: "myapp" });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("TURN not configured");
  });

  it("returns 503 when METERED_APP_NAME not set", async () => {
    const res = await makeRequest({ METERED_API_KEY: "key123", METERED_APP_NAME: "" });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("TURN not configured");
  });

  it("proxies Metered API and returns iceServers", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_ICE_SERVERS), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await makeRequest({
      METERED_API_KEY: "test-api-key",
      METERED_APP_NAME: "testapp",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.iceServers).toEqual(MOCK_ICE_SERVERS);
    expect(body.iceServers).toHaveLength(4);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://testapp.metered.live/api/v1/turn/credentials?apiKey=test-api-key",
    );
  });

  it("returns 502 when Metered API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("error", { status: 500 })));

    const res = await makeRequest({
      METERED_API_KEY: "test-api-key",
      METERED_APP_NAME: "testapp",
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch TURN credentials");
  });

  it("constructs correct Metered URL from env vars", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    await makeRequest({
      METERED_API_KEY: "my-secret-key",
      METERED_APP_NAME: "the-chat-prod",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://the-chat-prod.metered.live/api/v1/turn/credentials?apiKey=my-secret-key",
    );
  });
});
