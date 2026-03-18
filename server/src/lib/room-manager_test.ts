import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { RoomManager } from "./room-manager.ts";

// Minimal WebSocket mock for testing — we only need identity (reference equality)
const mockWs = () => ({}) as unknown as WebSocket;

describe("RoomManager", () => {
  it("creates a room on first join", () => {
    const rm = new RoomManager();
    const ws = mockWs();
    rm.join("room-1", ws, ["room:room-1", "pk:alice"]);

    const sockets = rm.getSockets("room-1");
    assertEquals(sockets.size, 1);
  });

  it("returns tags for a socket", () => {
    const rm = new RoomManager();
    const ws = mockWs();
    const tags = ["room:room-1", "pk:alice"];
    rm.join("room-1", ws, tags);

    assertEquals(rm.getTags(ws), tags);
  });

  it("allows two peers in the same room", () => {
    const rm = new RoomManager();
    const ws1 = mockWs();
    const ws2 = mockWs();
    rm.join("room-1", ws1, ["room:room-1", "pk:alice"]);
    rm.join("room-1", ws2, ["room:room-1", "pk:bob"]);

    assertEquals(rm.getSockets("room-1").size, 2);
  });

  it("throws when room is full (MAX_ROOM_SIZE = 6)", () => {
    const rm = new RoomManager();
    for (let i = 0; i < 6; i++) {
      rm.join("room-1", mockWs(), ["room:room-1", `pk:peer${i}`]);
    }

    assertThrows(
      () => rm.join("room-1", mockWs(), ["room:room-1", "pk:overflow"]),
      Error,
      "Room is full",
    );
  });

  it("removes socket on leave", () => {
    const rm = new RoomManager();
    const ws = mockWs();
    rm.join("room-1", ws, ["room:room-1"]);
    rm.leave("room-1", ws);

    assertEquals(rm.getSockets("room-1").size, 0);
  });

  it("auto-deletes room when last socket leaves", () => {
    const rm = new RoomManager();
    const ws = mockWs();
    rm.join("room-1", ws, ["room:room-1"]);
    rm.leave("room-1", ws);

    // getSockets returns empty map for nonexistent room
    assertEquals(rm.getSockets("room-1").size, 0);
    assertEquals(rm.roomCount, 0);
  });

  it("returns empty map for nonexistent room", () => {
    const rm = new RoomManager();
    assertEquals(rm.getSockets("nope").size, 0);
  });

  it("returns empty array for unknown socket tags", () => {
    const rm = new RoomManager();
    assertEquals(rm.getTags(mockWs()), []);
  });

  it("createRoom returns true for new room, false if already exists", () => {
    const rm = new RoomManager();
    assertEquals(rm.createRoom("room-new"), true);
    assertEquals(rm.roomCount, 1);
    assertEquals(rm.createRoom("room-new"), false);
    assertEquals(rm.roomCount, 1);
  });

  it("getRoomInfo returns room details for existing room", () => {
    const rm = new RoomManager();
    rm.createRoom("room-1");
    rm.join("room-1", mockWs(), ["room:room-1", "pk:alice"]);
    rm.join("room-1", mockWs(), ["room:room-1", "pk:bob"]);

    const info = rm.getRoomInfo("room-1");
    assertEquals(info.exists, true);
    assertEquals(info.participantCount, 2);
    assertEquals(info.maxSize, 6);
  });

  it("getRoomInfo returns exists=false for nonexistent room", () => {
    const rm = new RoomManager();
    const info = rm.getRoomInfo("no-such-room");
    assertEquals(info.exists, false);
    assertEquals(info.participantCount, 0);
    assertEquals(info.maxSize, 6);
  });
});
