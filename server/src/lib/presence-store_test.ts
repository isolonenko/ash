import { assertEquals } from "@std/assert";
import { describe, it, afterEach } from "@std/testing/bdd";
import { PresenceStore } from "./presence-store.ts";

describe("PresenceStore", () => {
  let store: PresenceStore;

  afterEach(() => {
    store?.destroy(); // stops the cleanup interval
  });

  it("stores and retrieves a record", () => {
    store = new PresenceStore();
    store.put("presence:alice", { roomId: "room-1", timestamp: 1000 }, 300);

    const record = store.get("presence:alice");
    assertEquals(record?.roomId, "room-1");
    assertEquals(record?.timestamp, 1000);
  });

  it("returns null for missing key", () => {
    store = new PresenceStore();
    assertEquals(store.get("nonexistent"), null);
  });

  it("returns null for expired key", () => {
    store = new PresenceStore();
    // TTL of 0 seconds — already expired
    store.put("presence:alice", { roomId: "room-1", timestamp: 1000 }, 0);

    assertEquals(store.get("presence:alice"), null);
  });

  it("deletes a key", () => {
    store = new PresenceStore();
    store.put("presence:alice", { roomId: "room-1", timestamp: 1000 }, 300);
    store.delete("presence:alice");

    assertEquals(store.get("presence:alice"), null);
  });

  it("overwrites existing key", () => {
    store = new PresenceStore();
    store.put("presence:alice", { roomId: "room-1", timestamp: 1000 }, 300);
    store.put("presence:alice", { roomId: "room-2", timestamp: 2000 }, 300);

    const record = store.get("presence:alice");
    assertEquals(record?.roomId, "room-2");
  });

  it("delete on nonexistent key is a no-op", () => {
    store = new PresenceStore();
    store.delete("nonexistent"); // should not throw
  });
});
