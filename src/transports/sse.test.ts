import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SseTransport } from './sse.js';
import type { JSONRPCMessage } from '../types.js';

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

describe('SseTransport', () => {
  const mockFetch = vi.fn();
  let transport: SseTransport;

  beforeEach(() => {
    transport = new SseTransport({
      eventSourceUrl: 'http://localhost:3000/events',
      sendUrl: 'http://localhost:3000/send',
      EventSource: MockEventSource as unknown as typeof EventSource,
      fetch: mockFetch,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should connect successfully', async () => {
    const connectPromise = transport.connect();
    await expect(connectPromise).resolves.toBeUndefined();
  });

  it('should handle messages', async () => {
    const messageHandler = vi.fn();
    transport.onMessage(messageHandler);

    await transport.connect();

    const mockEventSource = transport['_eventSource'] as MockEventSource;
    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      method: 'test',
      params: { foo: 'bar' },
    };

    mockEventSource.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify(message),
    }));

    // Wait for message processing
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(messageHandler).toHaveBeenCalledWith(message);
  });

  it('should send messages', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await transport.connect();

    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
      params: { foo: 'bar' },
    };

    await transport.send(message);

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
    const errorHandler = vi.fn();
    transport.onError(errorHandler);

    await transport.connect();

    const mockEventSource = transport['_eventSource'] as MockEventSource;
    mockEventSource.onerror?.(new ErrorEvent('error', {
      message: 'Connection failed',
    }));

    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Connection failed'),
      })
    );
  });

  it('should handle send errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await transport.connect();

    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
      params: { foo: 'bar' },
    };

    await expect(transport.send(message)).rejects.toThrow('Failed to send message: 500 Internal Server Error');
  });

  it('should disconnect properly', async () => {
    await transport.connect();
    await transport.disconnect();

    expect(transport['_started']).toBe(false);
    expect(transport['_eventSource']).toBeNull();
  });

  it('should handle headers in connection URL', async () => {
    transport = new SseTransport({
      eventSourceUrl: 'http://localhost:3000/events',
      sendUrl: 'http://localhost:3000/send',
      eventSourceHeaders: {
        'X-Auth-Token': 'test-token',
        'X-Custom-Header': 'custom-value',
      },
      EventSource: MockEventSource as unknown as typeof EventSource,
      fetch: mockFetch,
    });

    await transport.connect();

    const mockEventSource = transport['_eventSource'] as MockEventSource;
    expect(mockEventSource.url).toContain('X-Auth-Token=test-token');
    expect(mockEventSource.url).toContain('X-Custom-Header=custom-value');
  });

  it('should handle headers in send requests', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    transport = new SseTransport({
      eventSourceUrl: 'http://localhost:3000/events',
      sendUrl: 'http://localhost:3000/send',
      sendHeaders: {
        'X-Auth-Token': 'test-token',
        'X-Custom-Header': 'custom-value',
      },
      EventSource: MockEventSource as unknown as typeof EventSource,
      fetch: mockFetch,
    });

    await transport.connect();

    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
      params: { foo: 'bar' },
    };

    await transport.send(message);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/send',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Auth-Token': 'test-token',
          'X-Custom-Header': 'custom-value',
        }),
      })
    );
  });
});
