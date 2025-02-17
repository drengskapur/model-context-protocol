import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SseTransport } from './sse.js';
import type { JSONRPCMessage } from '../schema.js';

// Mock EventSource globally
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = 0;

  constructor(public url: string, public options?: EventSourceInit) {
    // Simulate successful connection after a tick
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }

  close() {
    this.readyState = 2;
  }
}

// @ts-expect-error - Mocking global EventSource
global.EventSource = MockEventSource;

describe('SseTransport', () => {
  let transport: SseTransport;
  let messageHandler: (message: JSONRPCMessage) => Promise<void>;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockImplementation(async () => new Response());
    transport = new SseTransport({
      eventSourceUrl: 'http://localhost:3000/events',
      sendUrl: 'http://localhost:3000/send',
      EventSource: MockEventSource as unknown as typeof EventSource,
      fetch: mockFetch as unknown as typeof fetch,
    });
    messageHandler = vi.fn().mockResolvedValue(undefined);
    transport.onMessage(messageHandler);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should connect successfully', async () => {
    await transport.connect();
    expect(transport['_eventSource']).toBeDefined();
  });

  it('should handle messages', async () => {
    await transport.connect();

    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
      params: {},
    };

    const mockEventSource = transport['_eventSource'] as MockEventSource;
    mockEventSource.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify(message),
    }));

    // Wait for message processing
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(messageHandler).toHaveBeenCalledWith(message);
  });

  it('should send messages', async () => {
    await transport.connect();
    await transport.send({ jsonrpc: '2.0', method: 'test', params: {} });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"method":"test"'),
        credentials: 'include',
      })
    );
  });

  it('should handle connection errors', async () => {
    await transport.connect();

    const errorHandler = vi.fn();
    transport.onError(errorHandler);

    const mockEventSource = transport['_eventSource'] as MockEventSource;
    mockEventSource.onerror?.(new Event('error'));

    expect(errorHandler).toHaveBeenCalled();
  });

  it('should handle send errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await transport.connect();
    await expect(transport.send({ jsonrpc: '2.0', method: 'test', params: {} }))
      .rejects.toThrow('Network error');
  });

  it('should disconnect properly', async () => {
    await transport.connect();
    const mockEventSource = transport['_eventSource'] as MockEventSource;
    await transport.disconnect();
    expect(mockEventSource.readyState).toBe(2);
  });

  it('should handle headers in connection URL', async () => {
    transport = new SseTransport({
      eventSourceUrl: 'http://localhost:3000/events',
      sendUrl: 'http://localhost:3000/send',
      eventSourceHeaders: { 'X-Test': 'test' },
      EventSource: MockEventSource as unknown as typeof EventSource,
      fetch: mockFetch as unknown as typeof fetch,
    });

    await transport.connect();

    const mockEventSource = transport['_eventSource'] as MockEventSource;
    expect(mockEventSource.url).toContain('X-Test=test');
  });

  it('should handle headers in send requests', async () => {
    transport = new SseTransport({
      eventSourceUrl: 'http://localhost:3000/events',
      sendUrl: 'http://localhost:3000/send',
      sendHeaders: { 'X-Test': 'test' },
      EventSource: MockEventSource as unknown as typeof EventSource,
      fetch: mockFetch as unknown as typeof fetch,
    });

    await transport.connect();
    await transport.send({ jsonrpc: '2.0', method: 'test', params: {} });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/send',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Test': 'test',
        }),
      })
    );
  });
});
