import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTransport } from './in-memory.js';
import type { JSONRPCMessage } from './schema.js';

describe('InMemoryTransport', () => {
  let transport: InMemoryTransport;

  beforeEach(() => {
    transport = new InMemoryTransport();
  });

  describe('Connection Management', () => {
    it('should handle connect and disconnect', async () => {
      expect(transport.isConnected()).toBe(false);

      await transport.connect();
      expect(transport.isConnected()).toBe(true);

      await transport.disconnect();
      expect(transport.isConnected()).toBe(false);
    });

    it('should handle close', async () => {
      await transport.connect();
      expect(transport.isConnected()).toBe(true);

      await transport.close();
      expect(transport.isConnected()).toBe(false);
    });

    it('should reject send when not connected', async () => {
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
      };

      await expect(transport.send(message)).rejects.toThrow(
        'Transport not connected'
      );
    });

    it('should reject simulate message when not connected', async () => {
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
      };

      await expect(transport.simulateIncomingMessage(message)).rejects.toThrow(
        'Transport not connected'
      );
    });
  });

  describe('Message Handling', () => {
    it('should store sent messages', async () => {
      await transport.connect();

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
      };

      await transport.send(message);
      expect(transport.getMessages()).toEqual([message]);
    });

    it('should clear messages', async () => {
      await transport.connect();

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
      };

      await transport.send(message);
      expect(transport.getMessages()).toHaveLength(1);

      transport.clearMessages();
      expect(transport.getMessages()).toHaveLength(0);
    });

    it('should handle message handlers', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      await transport.connect();
      transport.onMessage(handler1);
      transport.onMessage(handler2);

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
      };

      await transport.simulateIncomingMessage(message);

      expect(handler1).toHaveBeenCalledWith(message);
      expect(handler2).toHaveBeenCalledWith(message);

      transport.offMessage(handler1);
      await transport.simulateIncomingMessage(message);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(2);
    });

    it('should handle error handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      transport.onError(handler1);
      transport.onError(handler2);

      const error = new Error('Test error');
      for (const handler of transport.errorHandlers) {
        handler.call(transport, error);
      }

      expect(handler1).toHaveBeenCalledWith(error);
      expect(handler2).toHaveBeenCalledWith(error);

      transport.offError(handler1);
      for (const handler of transport.errorHandlers) {
        handler.call(transport, error);
      }

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(2);
    });
  });

  describe('Linked Pair', () => {
    it('should create linked pair', () => {
      const [transport1, transport2] = InMemoryTransport.createLinkedPair();

      expect(transport1._otherTransport).toBe(transport2);
      expect(transport2._otherTransport).toBe(transport1);
    });

    it('should forward messages between linked transports', async () => {
      const [transport1, transport2] = InMemoryTransport.createLinkedPair();
      await transport1.connect();
      await transport2.connect();

      const handler = vi.fn();
      transport2.onMessage(handler);

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
      };

      await transport1.send(message);
      expect(handler).toHaveBeenCalledWith(message);
    });

    it('should not forward messages if other transport is not connected', async () => {
      const [transport1, transport2] = InMemoryTransport.createLinkedPair();
      await transport1.connect();
      // transport2 is not connected

      const handler = vi.fn();
      transport2.onMessage(handler);

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
      };

      await transport1.send(message);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Progress and Cancellation', () => {
    it('should send progress notifications', async () => {
      await transport.connect();

      await transport.sendProgress('token1', 50, 100);

      const messages = transport.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: {
          progressToken: 'token1',
          progress: 50,
          total: 100,
        },
      });
    });

    it('should send cancellation notifications', async () => {
      await transport.connect();

      await transport.cancelRequest('req1', 'Test reason');

      const messages = transport.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        jsonrpc: '2.0',
        method: 'notifications/cancelled',
        params: {
          requestId: 'req1',
          reason: 'Test reason',
        },
      });
    });
  });
});
