import { Hono } from "hono";
import { cors } from "hono/cors";
import { createSignalingRoutes } from "./routes/signaling.ts";
import { createPresenceRoutes } from "./routes/presence.ts";
import { createHealthRoutes } from "./routes/health.ts";

const app = new Hono();

app.use("/*", cors());

app.route("/", createHealthRoutes());
app.route("/signal", createSignalingRoutes());
app.route("/presence", createPresenceRoutes());

const port = Number(Deno.env.get("PORT")) || 8080;

console.log(`[TheChat Signaling] listening on :${port}`);
Deno.serve({ port }, app.fetch);
