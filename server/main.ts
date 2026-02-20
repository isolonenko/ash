import { Hono } from "hono";
import { cors } from "hono/cors";
import { createSignalingRoutes } from "./routes/signaling.ts";
import { createPresenceRoutes } from "./routes/presence.ts";
import { createHealthRoutes } from "./routes/health.ts";
import { createTurnRoutes } from "./routes/turn.ts";

const app = new Hono();

app.use("/health/*", cors());
app.use("/ready/*", cors());
app.use("/presence/*", cors());
app.use("/turn-credentials/*", cors());

app.route("/", createHealthRoutes());
app.route("/signal", createSignalingRoutes());
app.route("/presence", createPresenceRoutes());
app.route("/turn-credentials", createTurnRoutes());

const port = Number(Deno.env.get("PORT")) || 8080;

console.log(`[TheChat Signaling] listening on :${port}`);
Deno.serve({ port }, app.fetch);
