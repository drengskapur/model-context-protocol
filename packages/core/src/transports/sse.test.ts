import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSONRPCMessage } from '../schema.js';
import { SseTransport } from './sse.js';

// Mock EventSource globally
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  readyState = 0;
  url: string;
  options?: EventSourceInit;
  private eventListeners: { [key: string]: ((event: Event) => void)[] } = {};

  constructor(url: string, options?: EventSourceInit) {
    this.url = url;
    this.options = options;
    // Simulate successful connection after a tick
    setTimeout(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event('open'));
    }, 0);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    if (!this.eventListeners[type]) {
      this.eventListeners[type] = [];
    }
    this.eventListeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    if (!this.eventListeners[type]) {
      return;
    }
    this.eventListeners[type] = this.eventListeners[type].filter(
      (l) => l !== listener
    );
  }

  dispatchEvent(event: Event): void {
    const listeners = this.eventListeners[event.type] || [];
    for (const listener of listeners) {
      listener(event);
    }
    if (event.type === 'message' && this.onmessage) {
      this.onmessage(event as MessageEvent);
    } else if (event.type === 'error' && this.onerror) {
      this.onerror(event);
    } else if (event.type === 'open' && this.onopen) {
      this.onopen(event);
    }
  }

  close() {
    this.readyState = 2;
  }
}

// Extended transport for testing
class TestSseTransport extends SseTransport {
  getEventSource() {
    return this._eventSource;
  }
}

describe('SseTransport', () => {
  let transport: TestSseTransport;

  beforeEach(() => {
    transport = new TestSseTransport({
      eventSourceUrl: 'http://localhost:3000/events',
      eventSourceHeaders: {},
      EventSource: MockEventSource as unknown as typeof EventSource,
    });
  });

  afterEach(async () => {
    await transport.disconnect();
  });

  it('should connect successfully', async () => {
    await transport.connect();
    expect(transport.getEventSource()).toBeDefined();
  });

  it('should handle messages', async () => {
    await transport.connect();
    const handler = vi.fn();
    transport.onMessage(handler);

    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      method: 'test',
      params: {},
    };

    const mockEventSource =
      transport.getEventSource() as unknown as MockEventSource;
    mockEventSource.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify(message),
      })
    );

    // Wait for async message processing
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handler).toHaveBeenCalledWith(message);
  });

  it('should handle errors', async () => {
    await transport.connect();
    const errorHandler = vi.fn();
    transport.onError(errorHandler);

    const mockEventSource =
      transport.getEventSource() as unknown as MockEventSource;
    mockEventSource.dispatchEvent(new Event('error'));

    expect(errorHandler).toHaveBeenCalledWith(new Error('SSE error occurred'));
  });

  it('should disconnect properly', async () => {
    await transport.connect();
    const mockEventSource =
      transport.getEventSource() as unknown as MockEventSource;
    await transport.disconnect();
    expect(mockEventSource.readyState).toBe(2);
  });

  it('should include headers as query parameters', async () => {
    transport = new TestSseTransport({
      eventSourceUrl: 'http://localhost:3000/events',
      eventSourceHeaders: {
        'X-Test': 'test',
      },
      EventSource: MockEventSource as unknown as typeof EventSource,
    });

    await transport.connect();
    const mockEventSource =
      transport.getEventSource() as unknown as MockEventSource;
    expect(mockEventSource.url).toContain('X-Test=test');
  });
});
