import { assertEquals, assert } from "jsr:@std/assert@1";
import { createTurnRoutes } from "./turn.ts";

Deno.test("GET /turn-credentials returns 503 when TURN_SHARED_SECRET not set", async () => {
  const originalSecret = Deno.env.get("TURN_SHARED_SECRET");
  Deno.env.delete("TURN_SHARED_SECRET");

  try {
    const routes = createTurnRoutes();
    const req = new Request("http://localhost/", { method: "GET" });
    const res = await routes.fetch(req);
    const data = await res.json();

    assertEquals(res.status, 503);
    assertEquals(data.error, "TURN not configured");
  } finally {
    if (originalSecret) {
      Deno.env.set("TURN_SHARED_SECRET", originalSecret);
    }
  }
});

Deno.test("GET /turn-credentials returns valid credential structure", async () => {
  const sharedSecret = "test-secret-key";
  const turnUrl = "turn:turn.example.com:3478";

  Deno.env.set("TURN_SHARED_SECRET", sharedSecret);
  Deno.env.set("TURN_SERVER_URL", turnUrl);

  try {
    const routes = createTurnRoutes();
    const req = new Request("http://localhost/", { method: "GET" });
    const res = await routes.fetch(req);
    const data = await res.json();

    assertEquals(res.status, 200);
    assert(data.username, "username should exist");
    assert(data.credential, "credential should exist");
    assertEquals(data.ttl, 86400, "ttl should be 86400");
    assert(Array.isArray(data.uris), "uris should be an array");
    assertEquals(data.uris.length, 2, "uris should have 2 entries");
  } finally {
    Deno.env.delete("TURN_SHARED_SECRET");
    Deno.env.delete("TURN_SERVER_URL");
  }
});

Deno.test("Username format matches pattern", async () => {
  const sharedSecret = "test-secret-key";

  Deno.env.set("TURN_SHARED_SECRET", sharedSecret);

  try {
    const routes = createTurnRoutes();
    const req = new Request("http://localhost/", { method: "GET" });
    const res = await routes.fetch(req);
    const data = await res.json();

    const usernamePattern = /^\d+:thechat$/;
    assert(
      usernamePattern.test(data.username),
      `Username ${data.username} should match pattern \\d+:thechat`
    );
  } finally {
    Deno.env.delete("TURN_SHARED_SECRET");
  }
});

Deno.test("Credential is valid base64", async () => {
  const sharedSecret = "test-secret-key";

  Deno.env.set("TURN_SHARED_SECRET", sharedSecret);

  try {
    const routes = createTurnRoutes();
    const req = new Request("http://localhost/", { method: "GET" });
    const res = await routes.fetch(req);
    const data = await res.json();

    const credentialBase64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
    assert(
      credentialBase64Pattern.test(data.credential),
      `Credential should be valid base64: ${data.credential}`
    );

    atob(data.credential);
  } finally {
    Deno.env.delete("TURN_SHARED_SECRET");
  }
});

Deno.test("HMAC-SHA1 credential verification", async () => {
  const sharedSecret = "test-secret-key";

  Deno.env.set("TURN_SHARED_SECRET", sharedSecret);

  try {
    const routes = createTurnRoutes();
    const req = new Request("http://localhost/", { method: "GET" });
    const res = await routes.fetch(req);
    const data = await res.json();

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(sharedSecret),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(data.username),
    );

    const expectedCredential = btoa(
      String.fromCharCode(...new Uint8Array(signature))
    );

    assertEquals(
      data.credential,
      expectedCredential,
      "Credential should match HMAC-SHA1 of username"
    );
  } finally {
    Deno.env.delete("TURN_SHARED_SECRET");
  }
});

Deno.test("URIs include both UDP and TCP transports", async () => {
  const sharedSecret = "test-secret-key";
  const turnUrl = "turn:turn.example.com:3478";

  Deno.env.set("TURN_SHARED_SECRET", sharedSecret);
  Deno.env.set("TURN_SERVER_URL", turnUrl);

  try {
    const routes = createTurnRoutes();
    const req = new Request("http://localhost/", { method: "GET" });
    const res = await routes.fetch(req);
    const data = await res.json();

    assertEquals(data.uris[0], turnUrl);
    assertEquals(data.uris[1], `${turnUrl}?transport=tcp`);
  } finally {
    Deno.env.delete("TURN_SHARED_SECRET");
    Deno.env.delete("TURN_SERVER_URL");
  }
});
