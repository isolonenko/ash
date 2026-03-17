import { Hono } from "hono";
import { cors } from "hono/cors";
import { RoomManager } from "./lib/room-manager.ts";
import { PresenceStore } from "./lib/presence-store.ts";
import { createSignalingRoutes } from "./routes/signaling.ts";
import { createPresenceRoutes } from "./routes/presence.ts";
import { createTurnRoutes } from "./routes/turn.ts";

// ── Config ──────────────────────────────────────────────

const PORT = parseInt(Deno.env.get("PORT") ?? "8000", 10);
const TURN_DOMAIN = Deno.env.get("TURN_DOMAIN") ?? "localhost";
const TURN_SECRET = Deno.env.get("TURN_SECRET") ?? "";

// ── Shared State ────────────────────────────────────────

const roomManager = new RoomManager();
const presenceStore = new PresenceStore();

// ── App ─────────────────────────────────────────────────

const app = new Hono();

// CORS for HTTP routes (WebSocket upgrade doesn't need CORS)
app.use("/presence/*", cors());
app.use("/turn-credentials/*", cors());

// Health check
app.get("/health", (c) =>
  c.json({ status: "ok", service: "thechat-signaling", timestamp: Date.now() }),
);

// Routes
app.route("/signal", createSignalingRoutes(roomManager));
app.route("/presence", createPresenceRoutes(presenceStore));
app.route("/turn-credentials", createTurnRoutes(TURN_DOMAIN, TURN_SECRET));

// ── Start ───────────────────────────────────────────────

Deno.serve({ port: PORT }, app.fetch);
