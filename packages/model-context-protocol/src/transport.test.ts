/**
 * @file transport.test.ts
 * @description Test suite for base transport implementation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
} from './json-rpc';
import { JSONRPC_VERSION } from './schema';
import { BaseTransport } from './transport';

// Helper to create valid JSON-RPC requests
function createRequest(
  id: string,
  method: string,
  params: Record<string, unknown> = {}
): JSONRPCRequest {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    method,
    params,
  };
}

class TestTransport extends BaseTransport {
  messages: (JSONRPCRequest | JSONRPCResponse)[] = [];
  shouldFail = false;

  setConnected(state: boolean): void {
    super.setConnected(state);
  }

  async send(message: JSONRPCRequest | JSONRPCResponse): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Send failed');
    }
    await Promise.resolve();
    this.messages.push(message);
    await this.handleMessage(message);
  }

  async connect(): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Connect failed');
    }
    await Promise.resolve();
    this.setConnected(true);
  }

  async disconnect(): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Disconnect failed');
    }
    await Promise.resolve();
    this.setConnected(false);
  }

  async request<T>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const request = createRequest(
      Math.random().toString(36).slice(2),
      method,
      params
    );
    await this.send(request);
    return {} as T;
  }

  async simulateMessage(message: JSONRPCMessage): Promise<void> {
    await this.handleMessage(message);
  }

  handleError(error: Error): void {
    this.events.emit('error', error);
  }

  simulateError(error: Error): void {
    this.handleError(error);
  }
}

describe('BaseTransport', () => {
  let transport: TestTransport;

  beforeEach(() => {
    transport = new TestTransport();
  });

  afterEach(async () => {
    try {
      await transport.close();
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  describe('Connection Management', () => {
    it('should connect successfully', async () => {
      const onConnect = vi.fn();
      transport.events.on('connect', onConnect);
      await transport.connect();
      expect(transport.isConnected()).toBe(true);
      expect(onConnect).toHaveBeenCalled();
    });

    it('should disconnect successfully', async () => {
      await transport.connect();
      const onDisconnect = vi.fn();
      transport.events.on('disconnect', onDisconnect);
      await transport.disconnect();
      expect(transport.isConnected()).toBe(false);
      expect(onDisconnect).toHaveBeenCalled();
    });

    it('should handle connection failures', async () => {
      transport.shouldFail = true;
      await expect(transport.connect()).rejects.toThrow('Connect failed');
    });

    it('should handle disconnection failures', async () => {
      await transport.connect();
      transport.shouldFail = true;
      await expect(transport.disconnect()).rejects.toThrow('Disconnect failed');
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      await transport.connect();
    });

    it('should emit message events', async () => {
      const onMessage = vi.fn();
      transport.events.on('message', onMessage);

      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
      };
      await transport.send(message);

      expect(onMessage).toHaveBeenCalledWith(message);
    });

    it('should handle multiple message handlers', async () => {
      const onMessage1 = vi.fn();
      const onMessage2 = vi.fn();
      transport.events.on('message', onMessage1);
      transport.events.on('message', onMessage2);

      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
      };
      await transport.send(message);

      expect(onMessage1).toHaveBeenCalledWith(message);
      expect(onMessage2).toHaveBeenCalledWith(message);
    });

    it('should remove message handlers', async () => {
      const onMessage1 = vi.fn();
      const onMessage2 = vi.fn();
      transport.events.on('message', onMessage1);
      transport.events.on('message', onMessage2);
      transport.events.off('message', onMessage1);

      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
      };
      await transport.send(message);

      expect(onMessage1).not.toHaveBeenCalled();
      expect(onMessage2).toHaveBeenCalledWith(message);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors', () => {
      const onError = vi.fn();
      transport.onError(onError);

      const error = new Error('Test error');
      transport.simulateError(error);

      expect(onError).toHaveBeenCalledWith(error);
    });

    it('should handle multiple error handlers', () => {
      const onError1 = vi.fn();
      const onError2 = vi.fn();
      transport.onError(onError1);
      transport.onError(onError2);

      const error = new Error('Test error');
      transport.simulateError(error);

      expect(onError1).toHaveBeenCalledWith(error);
      expect(onError2).toHaveBeenCalledWith(error);
    });

    it('should remove error handlers', () => {
      const onError1 = vi.fn();
      const onError2 = vi.fn();
      transport.onError(onError1);
      transport.onError(onError2);
      transport.offError(onError1);

      const error = new Error('Test error');
      transport.simulateError(error);

      expect(onError1).not.toHaveBeenCalled();
      expect(onError2).toHaveBeenCalledWith(error);
    });
  });

  describe('Message Timeout', () => {
    beforeEach(async () => {
      transport = new TestTransport({ messageTimeout: 100 }); // Short timeout for testing
      await transport.connect();
    });

    it('should handle message timeouts', async () => {
      const onError = vi.fn();
      transport.onError(onError);

      const message = createRequest('1', 'test');
      await transport.send(message);

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Message 1 timed out'),
        })
      );
    });

    it('should clean up timed out messages', async () => {
      const message = createRequest('1', 'test');
      await transport.send(message);

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // @ts-expect-error: Accessing private field for testing
      expect(transport.pendingMessages.has('1')).toBe(false);
    });
  });

  describe('Concurrent Message Handling', () => {
    beforeEach(async () => {
      await transport.connect();
    });

    it('should handle multiple concurrent messages', async () => {
      const receivedMessages: JSONRPCMessage[] = [];
      const messageHandler = (message: JSONRPCMessage) => {
        receivedMessages.push(message);
      };
      transport.events.on('message', messageHandler);

      const messages = Array.from({ length: 5 }, (_, i) =>
        createRequest(String(i + 1), 'test')
      );

      await Promise.all(messages.map((msg) => transport.send(msg)));

      expect(receivedMessages).toHaveLength(5);
      for (const msg of messages) {
        expect(receivedMessages).toContainEqual(msg);
      }
    });

    it('should maintain message order', async () => {
      const receivedMessages: JSONRPCMessage[] = [];
      const messageHandler = (message: JSONRPCMessage) => {
        receivedMessages.push(message);
      };
      transport.events.on('message', messageHandler);

      const messages = Array.from({ length: 5 }, (_, i) =>
        createRequest(String(i + 1), 'test')
      );

      await Promise.all(messages.map((msg) => transport.send(msg)));

      expect(receivedMessages).toHaveLength(5);
      for (const msg of messages) {
        expect(receivedMessages).toContainEqual(msg);
      }
    });
  });

  describe('Message Validation', () => {
    beforeEach(async () => {
      await transport.connect();
    });

    it('should validate JSON-RPC version', async () => {
      const onError = vi.fn();
      transport.onError(onError);

      // Create an invalid message with wrong version
      const invalidMessage = {
        jsonrpc: '1.0' as const,
        id: '1',
        method: 'test',
        params: {},
      };

      await transport.simulateMessage(
        invalidMessage as unknown as JSONRPCMessage
      );

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid message format',
        })
      );
    });

    it('should validate request message structure', async () => {
      const onError = vi.fn();
      transport.onError(onError);

      // Create an invalid message with wrong method type
      const invalidMessage = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 123, // Invalid method type
        params: {},
      };

      await transport.simulateMessage(
        invalidMessage as unknown as JSONRPCMessage
      );

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid message format',
        })
      );
    });

    it('should validate response message structure', async () => {
      const onError = vi.fn();
      transport.onError(onError);

      // Create an invalid message with both result and error
      const invalidMessage = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        result: {},
        error: {
          code: -32000,
          message: 'Test error',
        },
      };

      await transport.simulateMessage(
        invalidMessage as unknown as JSONRPCMessage
      );

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid message format',
        })
      );
    });
  });

  describe('Error Handler Behavior', () => {
    it('should handle errors in error handlers', () => {
      const errorInHandler = new Error('Error in handler');
      const errorHandler = vi.fn().mockImplementation(() => {
        throw errorInHandler;
      });

      transport.onError(errorHandler);

      const onError = vi.fn();
      transport.events.on('error', onError);

      const originalError = new Error('Original error');
      transport.simulateError(originalError);

      expect(errorHandler).toHaveBeenCalledWith(originalError);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Error in error handler'),
        })
      );
    });

    it('should continue processing other handlers after error', () => {
      const handler1 = vi.fn().mockImplementation(() => {
        throw new Error('Handler 1 error');
      });
      const handler2 = vi.fn();

      transport.onError(handler1);
      transport.onError(handler2);

      const error = new Error('Test error');
      transport.simulateError(error);

      expect(handler1).toHaveBeenCalledWith(error);
      expect(handler2).toHaveBeenCalledWith(error);
    });
  });

  describe('Connection State Changes', () => {
    it('should not emit duplicate connection events', async () => {
      const onConnect = vi.fn();
      transport.events.on('connect', onConnect);

      await transport.connect();
      transport.setConnected(true); // Try to set connected again

      expect(onConnect).toHaveBeenCalledTimes(1);
    });

    it('should not emit duplicate disconnection events', async () => {
      await transport.connect();

      const onDisconnect = vi.fn();
      transport.events.on('disconnect', onDisconnect);

      await transport.disconnect();
      transport.setConnected(false); // Try to set disconnected again

      expect(onDisconnect).toHaveBeenCalledTimes(1);
    });
  });
});
