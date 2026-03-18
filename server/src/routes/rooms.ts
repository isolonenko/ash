import { Hono } from "hono";
import { RoomManager } from "../lib/room-manager.ts";

export const createRoomsRoutes = (roomManager: RoomManager): Hono => {
  const routes = new Hono();

  // POST /rooms - Create a new room with a human-readable code
  routes.post("/", (c) => {
    const roomId = generateRoomCode();

    // Pre-register the room in RoomManager
    const created = roomManager.createRoom(roomId);
    if (!created) {
      // Should be extremely unlikely, but handle it
      return c.json({ error: "Failed to create room" }, 500);
    }

    return c.json({ id: roomId }, 201);
  });

  // GET /rooms/:id/check - Check if room exists and get info
  routes.get("/:id/check", (c) => {
    const roomId = c.req.param("id");
    const roomInfo = roomManager.getRoomInfo(roomId);

    if (!roomInfo.exists) {
      return c.json({ exists: false }, 200);
    }

    return c.json(roomInfo, 200);
  });

  return routes;
};

/**
 * Generate a human-readable room code in format: xxx-xxxx-xxx
 * Uses lowercase letters for easy typing and verbalization
 */
function generateRoomCode(): string {
  const segments = [3, 4, 3]; // segment lengths
  const letters = "abcdefghijklmnopqrstuvwxyz";

  const parts = segments.map((len) => {
    let segment = "";
    for (let i = 0; i < len; i++) {
      segment += letters[Math.floor(Math.random() * letters.length)];
    }
    return segment;
  });

  return parts.join("-");
}
