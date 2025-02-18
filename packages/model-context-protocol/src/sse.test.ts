import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSONRPCMessage } from './schema';
import { SseTransport, type SseTransportOptions } from './sse.js';
import type { Session, Channel } from 'better-sse';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { JSONRPCRequest } from './schema';
import { JSONRPC_VERSION } from './schema';

// Mock better-sse module
vi.mock('better-sse', () => {
  const mockSession = {
    close: vi.fn(),
    broadcast: vi.fn(),
    push: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    retry: vi.fn(),
  };

  const mockChannel = {
    close: vi.fn(),
    broadcast: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    register: vi.fn(),
  };

  return {
    createSession: vi.fn().mockResolvedValue(mockSession),
    createChannel: vi.fn().mockReturnValue(mockChannel),
  };
});

const CONNECT_ERROR_REGEX = /Failed to connect/;
const TRANSPORT_NOT_CONNECTED_REGEX = /Transport not connected/;
const SEND_ERROR_REGEX = /Failed to send message/;

describe('SseTransport', () => {
  let transport: SseTransport;
  let mockReq: IncomingMessage;
  let mockRes: ServerResponse;

  beforeEach(() => {
    mockReq = {} as IncomingMessage;
    mockRes = {
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;

    transport = new SseTransport({
      req: mockReq,
      res: mockRes,
      channel: 'test-channel',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Event Handling', () => {
    it('should handle message events', async () => {
      const handler = vi.fn();
      transport.on('message', handler);
      await transport.connect();

      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        id: '1',
      };

      // Get the session mock and simulate a message
      const { createSession } = await import('better-sse');
      const mockSession = await (createSession as any).mock.results[0].value;
      const messageHandler = mockSession.on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      if (messageHandler) {
        messageHandler({ data: JSON.stringify(message) });
        expect(handler).toHaveBeenCalledWith(message);
      }

      transport.off('message', handler);
    });

    it('should handle error events', async () => {
      const handler = vi.fn();
      transport.on('error', handler);
      await transport.connect();

      // Get the session mock and simulate an error
      const { createSession } = await import('better-sse');
      const mockSession = await (createSession as any).mock.results[0].value;
      const errorHandler = mockSession.on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )?.[1];

      if (errorHandler) {
        const error = new Error('Test error');
        errorHandler(error);
        expect(handler).toHaveBeenCalledWith(expect.any(Error));
      }
    });

    it('should handle multiple event listeners', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      transport.on('message', handler1);
      transport.on('message', handler2);
      await transport.connect();

      // Get the session mock and simulate a message
      const { createSession } = await import('better-sse');
      const mockSession = await (createSession as any).mock.results[0].value;
      const messageHandler = mockSession.on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      if (messageHandler) {
        const message: JSONRPCRequest = {
          jsonrpc: JSONRPC_VERSION,
          method: 'test',
          id: '1',
        };
        messageHandler({ data: JSON.stringify(message) });
        expect(handler1).toHaveBeenCalledWith(message);
        expect(handler2).toHaveBeenCalledWith(message);
      }
    });
  });

  describe('Connection Management', () => {
    it('should connect successfully', async () => {
      await transport.connect();
      expect(transport.isConnected()).toBe(true);
    });

    it('should set custom headers', async () => {
      const headers = {
        'X-Custom-Header': 'value',
        'X-Another-Header': 'value',
      };
      transport = new SseTransport({ req: mockReq, res: mockRes, headers });
      await transport.connect();

      for (const [key, value] of Object.entries(headers)) {
        expect(mockRes.setHeader).toHaveBeenCalledWith(key, value);
      }
    });

    it('should set retry timeout', async () => {
      const retryTimeout = 5000;
      transport = new SseTransport({
        req: mockReq,
        res: mockRes,
        retryTimeout,
      });
      await transport.connect();

      // Verify retry timeout was set
      const { createSession } = await import('better-sse');
      const mockSession = await (createSession as any).mock.results[0].value;
      expect(mockSession.retry).toHaveBeenCalledWith(retryTimeout);
    });

    it('should handle connection errors', async () => {
      const { createSession } = await import('better-sse');
      (createSession as any).mockRejectedValueOnce(
        new Error('Connection failed')
      );

      await expect(transport.connect()).rejects.toThrow(/Failed to connect/);
    });

    it('should handle disconnection', async () => {
      await transport.connect();
      await transport.disconnect();
      expect(transport.isConnected()).toBe(false);
    });
  });
});
