import { Hono } from "hono";
import type { Env } from "../env";

export const createTurnRoutes = (): Hono<{ Bindings: Env }> => {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get("/", async (c) => {
    const apiKey = c.env.METERED_API_KEY;
    const appName = c.env.METERED_APP_NAME;

    if (!apiKey || !appName) {
      return c.json({ error: "TURN not configured" }, 503);
    }

    const url = `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`;

    const res = await fetch(url);

    if (!res.ok) {
      return c.json({ error: "Failed to fetch TURN credentials" }, 502);
    }

    const iceServers = await res.json();

    return c.json({ iceServers });
  });

  return routes;
};
