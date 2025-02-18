import { Readable, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StdioTransport } from './stdio';
import type { JSONRPCRequest, JSONRPCResponse } from './schema';
import { JSONRPC_VERSION } from './schema';

const ALREADY_CONNECTED_REGEX = /already connected/;
const WRITE_ERROR_REGEX = /Write error/;

describe('StdioTransport', () => {
  let transport: StdioTransport;
  let input: Readable;
  let output: Writable;
  let outputData: string[];

  beforeEach(() => {
    outputData = [];
    input = new Readable({
      read() {
        // No-op
      },
    });

    output = new Writable({
      write(chunk, _, callback) {
        outputData.push(chunk.toString());
        callback();
      },
    });

    transport = new StdioTransport({
      input,
      output,
    });
  });

  afterEach(async () => {
    await transport.disconnect();
    input.destroy();
    output.destroy();
  });

  describe('connection management', () => {
    it('should connect successfully', async () => {
      await transport.connect();
      expect(transport.isConnected()).toBe(true);
    });

    it('should disconnect successfully', async () => {
      await transport.connect();
      await transport.disconnect();
      expect(transport.isConnected()).toBe(false);
    });

    it('should prevent double connect', async () => {
      await transport.connect();
      await expect(transport.connect()).rejects.toThrow(ALREADY_CONNECTED_REGEX);
    });
  });

  describe('message handling', () => {
    beforeEach(async () => {
      await transport.connect();
    });

    it('should send messages', async () => {
      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        id: '1',
      };
      await transport.send(message);
      expect(outputData).toHaveLength(1);
      expect(JSON.parse(outputData[0])).toEqual(message);
    });

    it('should receive messages', async () => {
      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        id: '1',
      };
      const received = new Promise<unknown>((resolve) => {
        transport.onMessage((msg) => {
          resolve(msg);
          return Promise.resolve();
        });
      });

      input.push(`${JSON.stringify(message)}\n`);
      expect(await received).toEqual(message);
    });

    it('should handle multiple messages in single chunk', async () => {
      const messages: JSONRPCRequest[] = [
        { jsonrpc: JSONRPC_VERSION, method: 'test1', id: '1' },
        { jsonrpc: JSONRPC_VERSION, method: 'test2', id: '2' },
      ];

      const received: unknown[] = [];
      transport.onMessage((msg) => {
        received.push(msg);
        return Promise.resolve();
      });

      input.push(messages.map(m => `${JSON.stringify(m)}\n`).join(''));
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(received).toEqual(messages);
    });

    it('should handle split messages across chunks', async () => {
      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        id: '1',
      };
      const json = JSON.stringify(message);

      const received = new Promise<unknown>((resolve) => {
        transport.onMessage((msg) => {
          resolve(msg);
          return Promise.resolve();
        });
      });

      input.push(json.slice(0, 10));
      input.push(`${json.slice(10)}\n`);

      expect(await received).toEqual(message);
    });

    it('should handle parse errors gracefully', async () => {
      const onError = vi.fn();
      transport.onError(onError);

      input.push('invalid json\n');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle handler errors', async () => {
      const error = new Error('Handler error');
      transport.onMessage(() => {
        throw error;
      });

      const onError = vi.fn();
      transport.onError(onError);

      input.push(`${JSON.stringify({ jsonrpc: JSONRPC_VERSION, method: 'test', id: '1' })}\n`);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await transport.connect();
    });

    it('should handle write errors', async () => {
      const error = new Error('Write error');
      const mockWrite = vi.fn().mockImplementation((_, __, cb) => cb(error));
      output.write = mockWrite;

      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        id: '1',
      };
      await expect(transport.send(message)).rejects.toThrow(WRITE_ERROR_REGEX);
    });

    it('should handle stream errors', () => {
      const onError = vi.fn();
      transport.onError(onError);

      const error = new Error('Stream error');
      input.emit('error', error);

      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  describe('cleanup', () => {
    it('should clean up handlers on disconnect', async () => {
      let messageCount = 0;
      await transport.connect();
      transport.onMessage(() => {
        messageCount++;
        return Promise.resolve();
      });

      await transport.disconnect();

      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        id: '1',
      };
      input.push(`${JSON.stringify(message)}\n`);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(messageCount).toBe(0);
    });
  });
});
