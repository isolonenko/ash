import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { RoomManager } from "./lib/room-manager.ts";
import { rateLimiter } from "./lib/rate-limiter.ts";
import { createSignalingRoutes } from "./routes/signaling.ts";
import { createRoomsRoutes } from "./routes/rooms.ts";
import { createTurnRoutes } from "./routes/turn.ts";

// ── Config ──────────────────────────────────────────────

const PORT = parseInt(Deno.env.get("PORT") ?? "8000", 10);
const TURN_DOMAIN = Deno.env.get("TURN_DOMAIN") ?? "localhost";
const TURN_SECRET = Deno.env.get("TURN_SECRET") ?? "";
const TURN_TTL = parseInt(Deno.env.get("TURN_TTL") ?? "3600", 10);
const CORS_ORIGIN = Deno.env.get("CORS_ORIGIN") ?? "*";

// ── Shared State ────────────────────────────────────────

const roomManager = new RoomManager();

// ── App ─────────────────────────────────────────────────

const app = new Hono();

// Security headers (all responses)
app.use(
  "*",
  secureHeaders({
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "no-referrer",
    strictTransportSecurity: false,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

// CORS (HTTP API routes only, not WebSocket)
const corsMiddleware = cors({
  origin: CORS_ORIGIN,
  allowMethods: ["GET", "POST"],
  maxAge: 86400,
});

app.use("/turn-credentials", corsMiddleware);
app.use("/rooms/*", corsMiddleware);
app.use("/rooms", corsMiddleware);

// Health check (no rate limit — monitoring / load balancer probes)
app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "thechat-signaling",
    timestamp: Date.now(),
  }),
);

// ── Rate-limited routes ─────────────────────────────────

app.use("/turn-credentials", rateLimiter({ windowMs: 60_000, max: 10 }));
app.use("/rooms/*", rateLimiter({ windowMs: 60_000, max: 30 }));
app.use("/rooms", rateLimiter({ windowMs: 60_000, max: 5 }));
app.use("/signal/*", rateLimiter({ windowMs: 60_000, max: 10 }));

// Routes
app.route("/signal", createSignalingRoutes(roomManager));
app.route(
  "/turn-credentials",
  createTurnRoutes(TURN_DOMAIN, TURN_SECRET, TURN_TTL),
);
app.route("/rooms", createRoomsRoutes(roomManager));

// ── Start ───────────────────────────────────────────────

Deno.serve({ port: PORT }, app.fetch);
