import { assertEquals } from "@std/assert";
import { afterEach, describe, it } from "@std/testing/bdd";
import { Hono } from "hono";
import { createPresenceRoutes } from "./presence.ts";
import { PresenceStore } from "../lib/presence-store.ts";

let store: PresenceStore;

const createApp = () => {
  store = new PresenceStore();
  const app = new Hono();
  app.route("/presence", createPresenceRoutes(store));
  return app;
};

describe("presence routes", () => {
  afterEach(() => {
    store?.destroy();
  });

  it("POST /:publicKey stores presence and returns ok", async () => {
    const app = createApp();
    const res = await app.request("/presence/alice-pk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: "room-abc" }),
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
  });

  it("POST /:publicKey returns 400 when roomId missing", async () => {
    const app = createApp();
    const res = await app.request("/presence/alice-pk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "roomId is required");
  });

  it("GET /:publicKey returns online status when present", async () => {
    const app = createApp();

    await app.request("/presence/alice-pk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: "room-xyz" }),
    });

    const res = await app.request("/presence/alice-pk");

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.online, true);
    assertEquals(body.roomId, "room-xyz");
    assertEquals(typeof body.timestamp, "number");
  });

  it("GET /:publicKey returns 404 when not present", async () => {
    const app = createApp();
    const res = await app.request("/presence/nonexistent");

    assertEquals(res.status, 404);
    const body = await res.json();
    assertEquals(body.online, false);
  });

  it("DELETE /:publicKey removes presence", async () => {
    const app = createApp();

    await app.request("/presence/alice-pk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: "room-del" }),
    });

    const delRes = await app.request("/presence/alice-pk", {
      method: "DELETE",
    });
    assertEquals(delRes.status, 200);

    const getRes = await app.request("/presence/alice-pk");
    assertEquals(getRes.status, 404);
  });
});
