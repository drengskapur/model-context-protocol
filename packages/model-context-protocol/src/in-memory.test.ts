/**
 * @file in-memory.test.ts
 * @description Test suite for the in-memory transport implementation.
 * Tests transport pairing, connection management, message handling, and event handling.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTransport } from './in-memory';
import type { JSONRPCRequest } from './schema';

describe('InMemoryTransport', () => {
  let transport1: InMemoryTransport;
  let transport2: InMemoryTransport;

  beforeEach(() => {
    [transport1, transport2] = InMemoryTransport.createPair();
  });

  describe('pairing', () => {
    it('should create paired transports', () => {
      expect(transport1.otherTransport).toBe(transport2);
      expect(transport2.otherTransport).toBe(transport1);
    });

    it('should reject operations when not paired', async () => {
      const unpaired = new InMemoryTransport();
      await expect(unpaired.connect()).rejects.toThrow('Transport not paired');
    });
  });

  describe('connection management', () => {
    it('should connect successfully', async () => {
      await transport1.connect();
      expect(transport1.isConnected()).toBe(true);
    });

    it('should disconnect successfully', async () => {
      await transport1.connect();
      await transport1.disconnect();
      expect(transport1.isConnected()).toBe(false);
    });

    it('should reject operations when not connected', async () => {
      await expect(transport1.send({})).rejects.toThrow(
        'Transport not connected'
      );
    });
  });

  describe('message handling', () => {
    beforeEach(async () => {
      await transport1.connect();
      await transport2.connect();
    });

    it('should deliver messages between transports', async () => {
      const message: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test',
        id: '1',
        params: { data: 'test' },
      };

      const received = new Promise<unknown>((resolve) => {
        transport2.onMessage((msg) => {
          resolve(msg);
          return Promise.resolve();
        });
      });

      await transport1.send(message);
      expect(await received).toEqual(message);
    });

    it('should handle multiple messages', async () => {
      const messages: JSONRPCRequest[] = [
        { jsonrpc: '2.0', method: 'test1', id: '1' },
        { jsonrpc: '2.0', method: 'test2', id: '2' },
      ];

      const received: unknown[] = [];
      transport2.onMessage((msg) => {
        received.push(msg);
        return Promise.resolve();
      });

      for (const message of messages) {
        await transport1.send(message);
      }

      expect(received).toEqual(messages);
    });

    it('should handle handler errors', async () => {
      const error = new Error('Handler error');
      transport2.onMessage(() => Promise.reject(error));

      await expect(transport1.send({})).rejects.toThrow('Handler error');
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await transport1.connect();
      await transport2.connect();
    });

    it('should handle send errors', async () => {
      transport2.onMessage(() => {
        throw new Error('Send error');
      });

      await expect(transport1.send({})).rejects.toThrow('Send error');
    });
  });

  describe('cleanup', () => {
    it('should clean up handlers on disconnect', async () => {
      let messageCount = 0;
      await transport1.connect();
      transport1.onMessage(() => {
        messageCount++;
        return Promise.resolve();
      });

      await transport1.disconnect();

      await transport2.send({
        jsonrpc: '2.0',
        method: 'test',
        id: '1',
      });

      expect(messageCount).toBe(0);
    });
  });
});
