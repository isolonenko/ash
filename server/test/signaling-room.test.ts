import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

const getRoomStub = (roomId: string) => {
  const id = env.SIGNALING_ROOM.idFromName(roomId);
  return env.SIGNALING_ROOM.get(id);
};

const makeUpgradeRequest = (roomId: string, publicKey?: string) => {
  const url = new URL(`https://fake-host/signal/${roomId}`);
  url.searchParams.set("roomId", roomId);
  if (publicKey) url.searchParams.set("publicKey", publicKey);

  return new Request(url.toString(), {
    headers: { Upgrade: "websocket" },
  });
};

describe("SignalingRoom DO", () => {
  it("accepts a WebSocket connection and returns 101", async () => {
    const stub = getRoomStub("test-room-1");
    const res = await stub.fetch(makeUpgradeRequest("test-room-1", "pk-alice"));

    expect(res.status).toBe(101);
    expect(res.webSocket).toBeTruthy();
  });

  it("rejects third connection with 409", async () => {
    const stub = getRoomStub("test-room-full");

    const res1 = await stub.fetch(makeUpgradeRequest("test-room-full", "pk-a"));
    expect(res1.status).toBe(101);
    res1.webSocket!.accept();

    const res2 = await stub.fetch(makeUpgradeRequest("test-room-full", "pk-b"));
    expect(res2.status).toBe(101);
    res2.webSocket!.accept();

    const res3 = await stub.fetch(makeUpgradeRequest("test-room-full", "pk-c"));
    expect(res3.status).toBe(409);
    const body = await res3.text();
    expect(body).toBe("Room is full");

    res1.webSocket!.close();
    res2.webSocket!.close();
  });

  it("broadcasts peer-joined when second peer connects", async () => {
    const stub = getRoomStub("test-room-join");

    const res1 = await stub.fetch(makeUpgradeRequest("test-room-join", "pk-alice"));
    const ws1 = res1.webSocket!;
    ws1.accept();

    const messages: string[] = [];
    ws1.addEventListener("message", (event) => {
      messages.push(event.data as string);
    });

    const res2 = await stub.fetch(makeUpgradeRequest("test-room-join", "pk-bob"));
    const ws2 = res2.webSocket!;
    ws2.accept();

    await new Promise((r) => setTimeout(r, 50));

    expect(messages.length).toBeGreaterThanOrEqual(1);
    const joinMsg = JSON.parse(messages[0]);
    expect(joinMsg.type).toBe("peer-joined");
    expect(joinMsg.senderPublicKey).toBe("pk-bob");

    ws1.close();
    ws2.close();
  });

  it("forwards allowed signaling messages between peers", async () => {
    const stub = getRoomStub("test-room-signal");

    const res1 = await stub.fetch(makeUpgradeRequest("test-room-signal", "pk-alice"));
    const ws1 = res1.webSocket!;
    ws1.accept();

    const res2 = await stub.fetch(makeUpgradeRequest("test-room-signal", "pk-bob"));
    const ws2 = res2.webSocket!;
    ws2.accept();

    const signalMessages: string[] = [];
    ws1.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data as string);
      if (msg.type !== "peer-joined") {
        signalMessages.push(event.data as string);
      }
    });

    await new Promise((r) => setTimeout(r, 50));

    const sdpOffer = JSON.stringify({
      type: "sdp-offer",
      roomId: "test-room-signal",
      senderPublicKey: "pk-bob",
      payload: { sdp: { type: "offer", sdp: "fake-sdp" } },
    });
    ws2.send(sdpOffer);

    await new Promise((r) => setTimeout(r, 50));

    expect(signalMessages.length).toBe(1);
    const received = JSON.parse(signalMessages[0]);
    expect(received.type).toBe("sdp-offer");

    ws1.close();
    ws2.close();
  });

  it("drops messages with disallowed types", async () => {
    const stub = getRoomStub("test-room-filter");

    const res1 = await stub.fetch(makeUpgradeRequest("test-room-filter", "pk-alice"));
    const ws1 = res1.webSocket!;
    ws1.accept();

    const res2 = await stub.fetch(makeUpgradeRequest("test-room-filter", "pk-bob"));
    const ws2 = res2.webSocket!;
    ws2.accept();

    const nonSignalMessages: string[] = [];
    ws1.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data as string);
      if (msg.type !== "peer-joined") {
        nonSignalMessages.push(event.data as string);
      }
    });

    await new Promise((r) => setTimeout(r, 50));

    ws2.send(JSON.stringify({ type: "evil-injection", roomId: "test-room-filter" }));

    await new Promise((r) => setTimeout(r, 50));

    expect(nonSignalMessages.length).toBe(0);

    ws1.close();
    ws2.close();
  });

  it("broadcasts peer-left when socket closes", async () => {
    const stub = getRoomStub("test-room-leave");

    const res1 = await stub.fetch(makeUpgradeRequest("test-room-leave", "pk-alice"));
    const ws1 = res1.webSocket!;
    ws1.accept();

    const res2 = await stub.fetch(makeUpgradeRequest("test-room-leave", "pk-bob"));
    const ws2 = res2.webSocket!;
    ws2.accept();

    const allMessages: string[] = [];
    ws1.addEventListener("message", (event) => {
      allMessages.push(event.data as string);
    });

    await new Promise((r) => setTimeout(r, 50));

    ws2.close(1000, "bye");

    await new Promise((r) => setTimeout(r, 100));

    const leftMsg = allMessages.find((m) => {
      const parsed = JSON.parse(m);
      return parsed.type === "peer-left";
    });
    expect(leftMsg).toBeTruthy();
    const parsed = JSON.parse(leftMsg!);
    expect(parsed.senderPublicKey).toBe("pk-bob");

    ws1.close();
  });
});
