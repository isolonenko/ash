import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSignalingClient } from '../signaling'

vi.mock('@/lib/config', () => ({
  SIGNALING_URL: 'wss://test.example.com',
}))

class MockWebSocket {
  static OPEN = 1
  static CONNECTING = 0
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null

  url: string
  close = vi.fn()
  send = vi.fn()

  constructor(url: string) {
    this.url = url
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  simulateClose(code = 1000) {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code } as CloseEvent)
  }

  simulateError() {
    this.onerror?.(new Event('error'))
  }
}

let lastCreatedWs: MockWebSocket | null = null

describe('signaling client: waitForOpen()', () => {
  let client: ReturnType<typeof createSignalingClient>

  beforeEach(() => {
    vi.useFakeTimers()
    lastCreatedWs = null
    const WebSocketStub = vi.fn((url: string) => {
      lastCreatedWs = new MockWebSocket(url)
      return lastCreatedWs
    })
    WebSocketStub.OPEN = MockWebSocket.OPEN
    WebSocketStub.CONNECTING = MockWebSocket.CONNECTING
    WebSocketStub.CLOSED = MockWebSocket.CLOSED
    vi.stubGlobal('WebSocket', WebSocketStub)
    client = createSignalingClient({
      peerId: 'test-peer',
      displayName: 'Tester',
      onMessage: vi.fn(),
    })
  })

  afterEach(() => {
    client.disconnect()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('resolves when WebSocket opens', async () => {
    client.connect('room-1')
    const ws = lastCreatedWs!
    const promise = client.waitForOpen(5000)
    ws.simulateOpen()
    await expect(promise).resolves.toBeUndefined()
  })

  it('rejects on timeout when WebSocket never opens', async () => {
    client.connect('room-1')
    const promise = client.waitForOpen(1000)
    vi.advanceTimersByTime(1001)
    await expect(promise).rejects.toThrow('Signaling connection timed out')
  })

  it('rejects when WebSocket closes before opening', async () => {
    client.connect('room-1')
    const ws = lastCreatedWs!
    const promise = client.waitForOpen(5000)
    ws.simulateError()
    ws.simulateClose(1006)
    await expect(promise).rejects.toThrow('Signaling connection failed')
  })

  it('resolves immediately if WebSocket is already open', async () => {
    client.connect('room-1')
    const ws = lastCreatedWs!
    ws.simulateOpen()
    await expect(client.waitForOpen(5000)).resolves.toBeUndefined()
  })

  it('rejects if called without connecting first', async () => {
    await expect(client.waitForOpen(5000)).rejects.toThrow('No WebSocket connection')
  })

  it('uses default timeout from SIGNALING_OPEN_TIMEOUT constant', async () => {
    client.connect('room-1')
    const promise = client.waitForOpen()
    vi.advanceTimersByTime(5001)
    await expect(promise).rejects.toThrow('Signaling connection timed out')
  })
})
