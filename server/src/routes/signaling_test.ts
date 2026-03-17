import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { RoomManager } from "../lib/room-manager.ts";
import { createSignalingRoutes } from "./signaling.ts";
import { Hono } from "hono";

let roomManager: RoomManager;

const createApp = () => {
  roomManager = new RoomManager();
  const app = new Hono();
  app.route("/signal", createSignalingRoutes(roomManager));
  return app;
};

describe("signaling routes", () => {
  it("returns 426 Upgrade Required when not a WebSocket request", async () => {
    const app = createApp();
    const res = await app.request("/signal/test-room");

    assertEquals(res.status, 426);
  });
});
