import { Hono } from "hono";
import { cors } from "hono/cors";
import { RoomManager } from "./lib/room-manager.ts";
import { createSignalingRoutes } from "./routes/signaling.ts";
import { createRoomsRoutes } from "./routes/rooms.ts";
import { createTurnRoutes } from "./routes/turn.ts";

// ── Config ──────────────────────────────────────────────

const PORT = parseInt(Deno.env.get("PORT") ?? "8000", 10);
const TURN_DOMAIN = Deno.env.get("TURN_DOMAIN") ?? "localhost";
const TURN_SECRET = Deno.env.get("TURN_SECRET") ?? "";

// ── Shared State ────────────────────────────────────────

const roomManager = new RoomManager();

// ── App ─────────────────────────────────────────────────

const app = new Hono();

app.use("/turn-credentials", cors());

// Health check
app.get(
  "/health",
  (c) =>
    c.json({
      status: "ok",
      service: "thechat-signaling",
      timestamp: Date.now(),
    }),
);

// Routes
app.route("/signal", createSignalingRoutes(roomManager));
app.route("/turn-credentials", createTurnRoutes(TURN_DOMAIN, TURN_SECRET));
app.route("/rooms", createRoomsRoutes(roomManager));
app.route("/turn-credentials", createTurnRoutes(TURN_DOMAIN, TURN_SECRET));
app.route("/rooms", createRoomsRoutes(roomManager));

// ── Start ───────────────────────────────────────────────

Deno.serve({ port: PORT }, app.fetch);
