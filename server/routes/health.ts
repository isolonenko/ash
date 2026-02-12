import { Hono } from "hono";

export const createHealthRoutes = (): Hono => {
  const routes = new Hono();

  routes.get("/health", (c) =>
    c.json({ status: "ok", service: "thechat-signaling", timestamp: Date.now() })
  );

  routes.get("/ready", (c) =>
    c.json({ status: "ready", timestamp: Date.now() })
  );

  return routes;
};
