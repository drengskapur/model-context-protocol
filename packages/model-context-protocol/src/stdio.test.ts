/**
 * @file stdio.test.ts
 * @description Test suite for standard I/O transport implementation.
 */

// Mock readline interface
const mockLineHandlers: ((line: string) => void)[] = [];

vi.mock('node:readline', () => ({
  createInterface: () => ({
    close: vi.fn(),
    on: vi.fn((event, handler) => {
      if (event === 'line') {
        mockLineHandlers.push(handler);
      }
    }),
    removeAllListeners: vi.fn(() => {
      mockLineHandlers.length = 0;
    }),
  }),
}));

// Mock TypedEventEmitter
vi.mock('./transport', async () => {
  const actual =
    await vi.importActual<typeof import('./transport')>('./transport');
  const { MockEventEmitter } = await import('./__mocks__/typed-event-emitter');
  return {
    ...actual,
    TypedEventEmitter: MockEventEmitter,
  };
});

import { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';
import { VError } from 'verror';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSONRPCRequest } from './json-rpc';
import { JSONRPC_VERSION } from './schema';
import { StdioTransport } from './stdio';

// Mock stream implementation for testing
class MockStream extends EventEmitter {
  public writtenData: string[] = [];
  public encoding: BufferEncoding = 'utf8';
  public destroyed = false;
  public readable = true;
  public writable = true;

  // Minimal implementation needed for tests
  setEncoding(encoding: BufferEncoding): this {
    this.encoding = encoding;
    return this;
  }

  write(chunk: string, callback?: (error?: Error | null) => void): boolean {
    this.writtenData.push(chunk.toString());
    if (callback) {
      callback();
    }
    return true;
  }

  destroy(error?: Error): void {
    this.destroyed = true;
    if (error) {
      this.emit('error', error);
    }
  }

  resume(): this {
    return this;
  }

  pause(): this {
    return this;
  }

  removeAllListeners(): this {
    super.removeAllListeners();
    return this;
  }

  // Helper methods for testing
  simulateData(data: string): void {
    for (const line of data.split('\n')) {
      if (line) {
        for (const handler of mockLineHandlers) {
          handler(line);
        }
      }
    }
  }

  simulateError(error: Error): void {
    this.emit('error', error);
  }
}

describe('StdioTransport', () => {
  let transport: StdioTransport;
  let inputStream: MockStream;
  let outputStream: MockStream;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLineHandlers.length = 0;
    inputStream = new MockStream();
    outputStream = new MockStream();
    transport = new StdioTransport({
      input: inputStream as unknown as Readable,
      output: outputStream as unknown as Writable,
    });
  });

  afterEach(async () => {
    if (transport) {
      await transport.disconnect();
    }
    mockLineHandlers.length = 0;
  });

  describe('Connection Management', () => {
    it('should connect successfully', async () => {
      const onConnect = vi.fn();
      transport.events.on('connect', onConnect);
      await transport.connect();
      expect(transport.isConnected()).toBe(true);
      expect(onConnect).toHaveBeenCalled();
    });

    it('should reject double connection', async () => {
      await transport.connect();
      try {
        await transport.connect();
        expect.fail('Expected connect to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(VError);
        expect(error).toHaveProperty('message', 'Transport already connected');
      }
    });

    it('should disconnect successfully', async () => {
      await transport.connect();
      const onDisconnect = vi.fn();
      transport.events.on('disconnect', onDisconnect);
      await transport.disconnect();
      expect(transport.isConnected()).toBe(false);
      expect(onDisconnect).toHaveBeenCalled();
    });

    it('should handle input stream errors', async () => {
      const onError = vi.fn();
      transport.onError(onError);
      await transport.connect();

      const streamError = new Error('Stream error');
      await new Promise<void>((resolve) => {
        transport.onError(() => resolve());
        inputStream.simulateError(streamError);
      });

      expect(onError).toHaveBeenCalledWith(streamError);
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      await transport.connect();
      // Wait for event handlers to be set up
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it('should handle complete messages', async () => {
      const onMessage = vi.fn();
      transport.events.on('message', onMessage);

      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
        params: {},
      };

      inputStream.simulateData(JSON.stringify(message) + '\n');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onMessage).toHaveBeenCalledWith(message);
    });

    it('should handle multiple messages in one chunk', async () => {
      const onMessage = vi.fn();
      transport.events.on('message', onMessage);

      const messages: JSONRPCRequest[] = [
        {
          jsonrpc: JSONRPC_VERSION,
          id: '1',
          method: 'test1',
          params: {},
        },
        {
          jsonrpc: JSONRPC_VERSION,
          id: '2',
          method: 'test2',
          params: {},
        },
      ];

      const data = messages.map((msg) => JSON.stringify(msg)).join('\n') + '\n';
      inputStream.simulateData(data);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onMessage).toHaveBeenCalledTimes(2);
      messages.forEach((msg, i) => {
        expect(onMessage).toHaveBeenNthCalledWith(i + 1, msg);
      });
    });

    it('should handle invalid JSON', async () => {
      const onError = vi.fn();
      transport.onError(onError);

      inputStream.simulateData('invalid json\n');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Failed to parse message'),
        })
      );
    });

    it('should handle empty lines', async () => {
      const onMessage = vi.fn();
      const onError = vi.fn();
      transport.events.on('message', onMessage);
      transport.onError(onError);

      inputStream.simulateData('\n\n\n');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onMessage).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('Message Sending', () => {
    beforeEach(async () => {
      await transport.connect();
    });

    it('should send messages with separator', async () => {
      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
        params: {},
      };

      await transport.send(message);

      expect(outputStream.writtenData).toEqual([
        `${JSON.stringify(message)}\n`,
      ]);
    });

    it('should reject sending when not connected', async () => {
      await transport.disconnect();

      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
        params: {},
      };

      await expect(transport.send(message)).rejects.toThrow(
        'Transport not connected'
      );
    });

    it('should handle write errors', async () => {
      // Mock write to fail
      vi.spyOn(outputStream, 'write').mockImplementation((_chunk, callback) => {
        if (callback && typeof callback === 'function') {
          callback(new Error('Write failed'));
        }
        return true;
      });

      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
        params: {},
      };

      await expect(transport.send(message)).rejects.toThrow('Write error');
    });
  });
});
