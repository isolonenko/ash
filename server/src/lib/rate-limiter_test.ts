import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { Hono } from "hono";
import { rateLimiter } from "./rate-limiter.ts";

const createApp = (max: number, windowMs: number = 60_000) => {
  const app = new Hono();
  app.use("/*", rateLimiter({ windowMs, max }));
  app.get("/test", (c) => c.text("ok"));
  return app;
};

describe(
  { name: "rateLimiter", sanitizeOps: false, sanitizeResources: false },
  () => {
    it("allows requests under the limit", async () => {
      const app = createApp(3);
      const res = await app.request("/test");
      assertEquals(res.status, 200);
    });

    it("returns 429 when limit is exceeded", async () => {
      const app = createApp(2);
      await app.request("/test");
      await app.request("/test");
      const res = await app.request("/test");

      assertEquals(res.status, 429);
      const body = await res.json();
      assertEquals(body.error, "Too many requests");
    });

    it("includes Retry-After header on 429", async () => {
      const app = createApp(1);
      await app.request("/test");
      const res = await app.request("/test");

      assertEquals(res.status, 429);
      const retryAfter = res.headers.get("Retry-After");
      assertEquals(retryAfter !== null, true);
      assertEquals(parseInt(retryAfter!, 10) > 0, true);
    });

    it("uses x-forwarded-for to distinguish clients", async () => {
      const app = createApp(1);

      const res1 = await app.request("/test", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      });
      assertEquals(res1.status, 200);

      const res2 = await app.request("/test", {
        headers: { "x-forwarded-for": "5.6.7.8" },
      });
      assertEquals(res2.status, 200);

      const res3 = await app.request("/test", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      });
      assertEquals(res3.status, 429);
    });

    it("allows requests after window expires", async () => {
      const app = createApp(1, 50);
      await app.request("/test");

      await new Promise((resolve) => setTimeout(resolve, 60));

      const res = await app.request("/test");
      assertEquals(res.status, 200);
    });
  },
);
