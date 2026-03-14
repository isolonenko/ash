import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { createSignalingRoutes } from "./routes/signaling";
import { createPresenceRoutes } from "./routes/presence";
import { createTurnRoutes } from "./routes/turn";

// Re-export Durable Object for wrangler to discover
export { SignalingRoom } from "./durable-objects/signaling-room";

const app = new Hono<{ Bindings: Env }>();

// CORS for HTTP routes (WebSocket upgrade doesn't need CORS)
app.use("/presence/*", cors());
app.use("/turn-credentials/*", cors());

// Health check
app.get("/health", (c) =>
  c.json({ status: "ok", service: "thechat-signaling", timestamp: Date.now() }),
);

// Routes
app.route("/signal", createSignalingRoutes());
app.route("/presence", createPresenceRoutes());
app.route("/turn-credentials", createTurnRoutes());

export default app;
