/**
 * @file in-memory.test.ts
 * @description Test suite for the in-memory transport implementation.
 * Tests transport pairing, connection management, message handling, and event handling.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTransport } from './in-memory';
import type { JSONRPCRequest, JSONRPCResponse, JSONRPCMessage } from './schema';
import { JSONRPC_VERSION } from './schema';

describe('InMemoryTransport', () => {
  let transport1: InMemoryTransport;
  let transport2: InMemoryTransport;

  beforeEach(() => {
    [transport1, transport2] = InMemoryTransport.createPair();
  });

  describe('pairing', () => {
    it('should create paired transports', () => {
      // Test pairing through behavior instead of accessing private property
      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
      };
      transport1.connect();
      transport2.connect();
      transport1.send(message);
      expect(transport2.getMessages()).toContainEqual(message);
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
      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
      };
      await expect(transport1.send(message)).rejects.toThrow(
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
        jsonrpc: JSONRPC_VERSION,
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
        { jsonrpc: JSONRPC_VERSION, method: 'test1', id: '1' },
        { jsonrpc: JSONRPC_VERSION, method: 'test2', id: '2' },
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

      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
      };
      await expect(transport1.send(message)).rejects.toThrow('Handler error');
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

      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
      };
      await expect(transport1.send(message)).rejects.toThrow('Send error');
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
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        id: '1',
      });

      expect(messageCount).toBe(0);
    });
  });

  describe('message simulation and storage', () => {
    beforeEach(async () => {
      await transport1.connect();
      await transport2.connect();
    });

    it('should simulate incoming messages', async () => {
      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        id: '1',
        params: { data: 'test' },
      };

      const received = new Promise<unknown>((resolve) => {
        transport1.onMessage((msg) => {
          resolve(msg);
          return Promise.resolve();
        });
      });

      await transport1.simulateIncomingMessage(message);
      expect(await received).toEqual(message);
    });

    it('should reject invalid messages in simulation', async () => {
      const invalidMessage = { invalid: 'message' };
      await expect(transport1.simulateIncomingMessage(invalidMessage as any)).rejects.toThrow(
        'Invalid message format'
      );
    });

    it('should store and retrieve sent messages', async () => {
      const messages: JSONRPCRequest[] = [
        { jsonrpc: JSONRPC_VERSION, method: 'test1', id: '1' },
        { jsonrpc: JSONRPC_VERSION, method: 'test2', id: '2' },
      ];

      for (const message of messages) {
        await transport1.send(message);
      }

      expect(transport1.getMessages()).toEqual(messages);
    });

    it('should clear stored messages', async () => {
      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        id: '1',
      };
      await transport1.send(message);
      transport1.clearMessages();
      expect(transport1.getMessages()).toHaveLength(0);
    });
  });

  describe('error handling and events', () => {
    beforeEach(async () => {
      await transport1.connect();
      await transport2.connect();
    });

    it('should emit error events on handler failures', async () => {
      const error = new Error('Handler error');
      const errorPromise = new Promise<Error>((resolve) => {
        transport2.onError((err) => resolve(err));
      });

      transport2.onMessage(() => {
        throw error;
      });

      await transport1.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        id: '1',
      });
      const emittedError = await errorPromise;
      expect(emittedError).toBe(error);
    });

    it('should handle error event subscription/unsubscription', () => {
      const handler = (error: Error) => {};
      transport1.onError(handler);
      transport1.offError(handler);
      // No assertion needed - just verifying the methods don't throw
    });
  });

  describe('transport closure', () => {
    it('should properly close the transport', async () => {
      await transport1.connect();
      await transport1.close();
      
      expect(transport1.isConnected()).toBe(false);
      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        id: '1',
      };
      await expect(transport1.send(message)).rejects.toThrow('Transport not connected');
    });

    it('should clear transport pairing on close', async () => {
      await transport1.close();
      await expect(transport1.connect()).rejects.toThrow('Transport not paired');
    });
  });
});
