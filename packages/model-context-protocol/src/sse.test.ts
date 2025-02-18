import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSONRPCMessage } from '../schema.js';
import { SseTransport, type SseTransportOptions } from './sse.js';
import type { Session, Channel } from 'better-sse';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { JSONRPCRequest } from './schema';

// Mock EventSource class
class MockEventSource implements EventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly CONNECTING = MockEventSource.CONNECTING;
  readonly OPEN = MockEventSource.OPEN;
  readonly CLOSED = MockEventSource.CLOSED;

  readyState = 0;
  url: string;
  withCredentials = false;

  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  close = vi.fn();
  dispatchEvent = vi.fn();

  onerror: ((this: EventSource, ev: Event) => void) | null = null;
  onmessage: ((this: EventSource, ev: MessageEvent) => void) | null = null;
  onopen: ((this: EventSource, ev: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }
}

// Extended transport for testing
class TestSseTransport extends SseTransport {
  getEventSource() {
    return this._eventSource;
  }
}

describe('SseTransport', () => {
  const defaultOptions: SseTransportOptions = {
    eventSourceUrl: 'http://test',
  };

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

  describe('Message Handler Management', () => {
    it('should add and remove message handlers', () => {
      const transport = new SseTransport(defaultOptions);
      const handler = async () => {
        /* noop */
      };

      transport.onMessage(handler);
      expect(transport.messageProcessor.hasHandler(handler)).toBe(true);

      transport.offMessage(handler);
      expect(transport.messageProcessor.hasHandler(handler)).toBe(false);
    });

    it('should handle multiple message handlers', async () => {
      const transport = new SseTransport(defaultOptions);
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      transport.onMessage(handler1);
      transport.onMessage(handler2);

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
      };

      await transport.messageProcessor.processMessage(JSON.stringify(message));

      expect(handler1).toHaveBeenCalledWith(message);
      expect(handler2).toHaveBeenCalledWith(message);
    });

    it('should handle message handler errors', async () => {
      const transport = new SseTransport(defaultOptions);
      const error = new Error('Handler error');
      const errorHandler = vi.fn();
      const messageHandler = vi.fn().mockRejectedValue(error);

      transport.onError(errorHandler);
      transport.onMessage(messageHandler);

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
      };

      await transport.messageProcessor.processMessage(JSON.stringify(message));

      expect(messageHandler).toHaveBeenCalledWith(message);
      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Error Handler Management', () => {
    it('should add and remove error handlers', () => {
      const transport = new SseTransport(defaultOptions);
      const handler = () => {
        /* noop */
      };

      transport.onError(handler);
      expect(transport.errorManager.hasHandler(handler)).toBe(true);

      transport.offError(handler);
      expect(transport.errorManager.hasHandler(handler)).toBe(false);
    });

    it('should handle multiple error handlers', () => {
      const transport = new SseTransport(defaultOptions);
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const error = new Error('Test error');

      transport.onError(handler1);
      transport.onError(handler2);

      transport.errorManager.handleError(error);

      expect(handler1).toHaveBeenCalledWith(error);
      expect(handler2).toHaveBeenCalledWith(error);
    });

    it('should remove specific error handler', () => {
      const transport = new SseTransport(defaultOptions);
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const error = new Error('Test error');

      transport.onError(handler1);
      transport.onError(handler2);
      transport.offError(handler1);

      transport.errorManager.handleError(error);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith(error);
    });
  });

  describe('Connection Management', () => {
    it('should handle connection lifecycle', async () => {
      const transport = new SseTransport(defaultOptions);

      // Mock EventSource
      const mockEventSource = new MockEventSource(
        defaultOptions.eventSourceUrl
      );
      const MockEventSourceClass = vi.fn(
        () => mockEventSource
      ) as unknown as typeof EventSource;
      Object.defineProperties(MockEventSourceClass, {
        CONNECTING: { value: MockEventSource.CONNECTING },
        OPEN: { value: MockEventSource.OPEN },
        CLOSED: { value: MockEventSource.CLOSED },
      });

      transport.options.EventSource = MockEventSourceClass;

      await transport.connect();
      expect(MockEventSourceClass).toHaveBeenCalledWith(
        defaultOptions.eventSourceUrl
      );
      expect(mockEventSource.addEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function)
      );
      expect(mockEventSource.addEventListener).toHaveBeenCalledWith(
        'error',
        expect.any(Function)
      );

      await transport.disconnect();
      expect(mockEventSource.removeEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function)
      );
      expect(mockEventSource.removeEventListener).toHaveBeenCalledWith(
        'error',
        expect.any(Function)
      );
      expect(mockEventSource.close).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      const transport = new SseTransport(defaultOptions);
      const errorHandler = vi.fn();
      transport.onError(errorHandler);

      // Mock EventSource that throws on construction
      const error = new Error('Connection failed');
      const MockEventSourceClass = vi.fn(() => {
        throw error;
      }) as unknown as typeof EventSource;
      Object.defineProperties(MockEventSourceClass, {
        CONNECTING: { value: MockEventSource.CONNECTING },
        OPEN: { value: MockEventSource.OPEN },
        CLOSED: { value: MockEventSource.CLOSED },
      });

      transport.options.EventSource = MockEventSourceClass;

      await expect(transport.connect()).rejects.toThrow('Connection failed');
      expect(errorHandler).toHaveBeenCalledWith(error);
    });
  });

  describe('Message Processing', () => {
    it('should handle invalid JSON', async () => {
      const transport = new SseTransport(defaultOptions);
      const errorHandler = vi.fn();
      transport.onError(errorHandler);

      // Mock EventSource
      const mockEventSource = new MockEventSource(
        defaultOptions.eventSourceUrl
      );
      const MockEventSourceClass = vi.fn(
        () => mockEventSource
      ) as unknown as typeof EventSource;
      Object.defineProperties(MockEventSourceClass, {
        CONNECTING: { value: MockEventSource.CONNECTING },
        OPEN: { value: MockEventSource.OPEN },
        CLOSED: { value: MockEventSource.CLOSED },
      });

      transport.options.EventSource = MockEventSourceClass;

      await transport.connect();

      // Get the message event handler
      const messageHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'message'
      )?.[1];

      if (!messageHandler) {
        throw new Error('Message handler not registered');
      }

      // Simulate receiving invalid JSON
      messageHandler({ data: 'invalid json' });

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle valid messages', async () => {
      const transport = new SseTransport(defaultOptions);
      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);

      // Mock EventSource
      const mockEventSource = new MockEventSource(
        defaultOptions.eventSourceUrl
      );
      const MockEventSourceClass = vi.fn(
        () => mockEventSource
      ) as unknown as typeof EventSource;
      Object.defineProperties(MockEventSourceClass, {
        CONNECTING: { value: MockEventSource.CONNECTING },
        OPEN: { value: MockEventSource.OPEN },
        CLOSED: { value: MockEventSource.CLOSED },
      });

      transport.options.EventSource = MockEventSourceClass;

      await transport.connect();

      // Get the message event handler
      const eventHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'message'
      )?.[1];

      if (!eventHandler) {
        throw new Error('Message handler not registered');
      }

      // Simulate receiving valid JSON
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
      };
      eventHandler({ data: JSON.stringify(message) });

      expect(messageHandler).toHaveBeenCalledWith(message);
    });
  });
});

vi.mock('better-sse', () => ({
  createSession: vi.fn(() => ({
    retry: vi.fn(),
    close: vi.fn(),
    push: vi.fn(),
    on: vi.fn(),
  })),
  Channel: vi.fn(() => ({
    register: vi.fn(),
    broadcast: vi.fn(),
    close: vi.fn(),
  })),
}));

describe('SseTransport', () => {
  let transport: SseTransport;
  let req: IncomingMessage;
  let res: ServerResponse;

  beforeEach(() => {
    req = {
      headers: {},
    } as IncomingMessage;

    res = {
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;

    transport = new SseTransport({ req, res });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('connection management', () => {
    it('should connect successfully', async () => {
      await transport.connect();
      expect(transport.isConnected()).toBe(true);
    });

    it('should set custom headers', async () => {
      const headers = {
        'X-Custom-Header': 'test',
        'X-Another-Header': 'value',
      };
      transport = new SseTransport({ req, res, headers });
      await transport.connect();

      Object.entries(headers).forEach(([key, value]) => {
        expect(res.setHeader).toHaveBeenCalledWith(key, value);
      });
    });

    it('should set retry timeout', async () => {
      const retryTimeout = 5000;
      transport = new SseTransport({ req, res, retryTimeout });
      await transport.connect();

      const session = transport.getSession();
      expect(session?.retry).toHaveBeenCalledWith(retryTimeout);
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      const { createSession } = await import('better-sse');
      vi.mocked(createSession).mockRejectedValueOnce(error);

      await expect(transport.connect()).rejects.toThrow(/Failed to connect/);
      expect(transport.isConnected()).toBe(false);
    });

    it('should disconnect successfully', async () => {
      await transport.connect();
      await transport.disconnect();
      expect(transport.isConnected()).toBe(false);

      const session = transport.getSession();
      expect(session?.close).toHaveBeenCalled();
    });

    it('should handle session close events', async () => {
      await transport.connect();

      // Simulate session close
      const session = transport.getSession();
      const closeHandler = vi
        .mocked(session?.on)
        .mock.calls.find((call) => call[0] === 'close')?.[1];
      closeHandler?.();

      expect(transport.isConnected()).toBe(false);
    });
  });

  describe('message handling', () => {
    beforeEach(async () => {
      await transport.connect();
    });

    it('should send messages through session', async () => {
      const message: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test',
        id: '1',
        params: { data: 'test' },
      };

      await transport.send(message);

      const session = transport.getSession();
      expect(session?.push).toHaveBeenCalledWith(
        'message',
        JSON.stringify(message),
        { data: { id: '1' } }
      );
    });

    it('should broadcast messages through channel', async () => {
      transport = new SseTransport({ req, res, channel: 'test-channel' });
      await transport.connect();

      const message: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test',
        id: '1',
        params: { data: 'test' },
      };

      await transport.send(message);

      const channel = transport.getChannel();
      expect(channel?.broadcast).toHaveBeenCalledWith(
        'message',
        JSON.stringify(message),
        { data: { id: '1' } }
      );
    });

    it('should reject messages when not connected', async () => {
      await transport.disconnect();
      await expect(transport.send({})).rejects.toThrow(
        /Transport not connected/
      );
    });

    it('should handle send errors', async () => {
      const session = transport.getSession();
      const error = new Error('Send failed');
      vi.mocked(session?.push).mockRejectedValueOnce(error);

      await expect(transport.send({})).rejects.toThrow(
        /Failed to send message/
      );
    });
  });

  describe('channel handling', () => {
    it('should create and register channel', async () => {
      transport = new SseTransport({ req, res, channel: 'test-channel' });
      await transport.connect();

      const channel = transport.getChannel();
      expect(channel).toBeDefined();
      expect(channel?.register).toHaveBeenCalled();
    });

    it('should close channel on disconnect', async () => {
      transport = new SseTransport({ req, res, channel: 'test-channel' });
      await transport.connect();
      await transport.disconnect();

      const channel = transport.getChannel();
      expect(channel?.close).toHaveBeenCalled();
    });
  });
});
