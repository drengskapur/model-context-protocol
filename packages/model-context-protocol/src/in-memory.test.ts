import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTransport } from './in-memory.js';
import type { MessageHandler } from './transport.js';
import type { TransportEventMap } from './base.js';

describe('InMemoryTransport', () => {
  let transport1: InMemoryTransport;
  let transport2: InMemoryTransport;

  beforeEach(() => {
    [transport1, transport2] = InMemoryTransport.createPair();
  });

  describe('pairing', () => {
    it('should create paired transports', () => {
      expect(transport1['otherTransport']).toBe(transport2);
      expect(transport2['otherTransport']).toBe(transport1);
    });

    it('should reject operations when not paired', async () => {
      const unpaired = new InMemoryTransport();
      await expect(unpaired.connect()).rejects.toThrow('Transport not paired');
    });
  });

  describe('connection management', () => {
    it('should connect successfully', async () => {
      await transport1.connect();
      await transport2.connect();
    });

    it('should disconnect successfully', async () => {
      await transport1.connect();
      await transport2.connect();
      await transport1.disconnect();
      await transport2.disconnect();
    });

    it('should reject operations when not connected', async () => {
      const message = {
        jsonrpc: '2.0' as const,
        method: 'test',
        id: '1',
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
      const message = {
        jsonrpc: '2.0' as const,
        method: 'test',
        id: '1',
        params: { data: 'test' },
      };

      let received: unknown;
      const handler: MessageHandler = async (msg: unknown) => {
        received = msg;
      };
      transport2.onMessage(handler);

      await transport1.send(message);
      expect(received).toEqual(message);
    });

    it('should handle multiple messages', async () => {
      const messages = [
        {
          jsonrpc: '2.0' as const,
          method: 'test1',
          id: '1',
          params: { data: 'first' },
        },
        {
          jsonrpc: '2.0' as const,
          method: 'test2',
          id: '2',
          params: { data: 'second' },
        },
      ];

      const received: unknown[] = [];
      const handler: MessageHandler = async (msg: unknown) => {
        received.push(msg);
      };
      transport2.onMessage(handler);

      for (const message of messages) {
        await transport1.send(message);
      }

      expect(received).toEqual(messages);
    });

    it('should handle handler errors', async () => {
      const error = new Error('Handler error');
      const handler: MessageHandler = async (msg: unknown) => {
        throw error;
      };
      transport2.onMessage(handler);

      const message = {
        jsonrpc: '2.0' as const,
        method: 'test',
        id: '1',
      };

      await expect(transport1.send(message)).rejects.toThrow('Handler error');
    });

    it('should remove message handlers', async () => {
      const message = {
        jsonrpc: '2.0' as const,
        method: 'test',
        id: '1',
      };

      const received: unknown[] = [];
      const handler: MessageHandler = async (msg: unknown) => {
        received.push(msg);
      };

      transport2.onMessage(handler);
      await transport1.send(message);
      expect(received).toHaveLength(1);

      transport2.offMessage(handler);
      await transport1.send(message);
      expect(received).toHaveLength(1); // Should not increase
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await transport1.connect();
      await transport2.connect();
    });

    it('should emit error events', () => {
      const onError = vi.fn();
      transport1.on('error', onError);

      const error = new Error('Test error');
      (transport1 as any).handleError(error);
      expect(onError).toHaveBeenCalledWith(error);
    });

    it('should handle disconnect errors', async () => {
      (transport1 as any).shouldFail = true;
      await expect(transport1.disconnect()).rejects.toThrow(
        /Failed to disconnect transport/
      );
    });
  });

  describe('event handling', () => {
    beforeEach(async () => {
      await transport1.connect();
    });

    it('should emit connect events', async () => {
      const onConnect = vi.fn();
      transport2.on('connect', onConnect);
      await transport2.connect();
      expect(onConnect).toHaveBeenCalled();
    });

    it('should emit disconnect events', async () => {
      const onDisconnect = vi.fn();
      transport2.on('disconnect', onDisconnect);
      await transport2.disconnect();
      expect(onDisconnect).toHaveBeenCalled();
    });

    it('should support multiple event listeners', async () => {
      const onMessage1 = vi.fn();
      const onMessage2 = vi.fn();
      transport2.on('message', onMessage1);
      transport2.on('message', onMessage2);

      const message = { jsonrpc: '2.0', method: 'test', id: '1' };
      await transport1.send(message);

      expect(onMessage1).toHaveBeenCalledWith(message);
      expect(onMessage2).toHaveBeenCalledWith(message);
    });

    it('should remove event listeners', async () => {
      const onMessage = vi.fn();
      transport2.on('message', onMessage);
      transport2.off('message', onMessage);

      await transport1.send({ jsonrpc: '2.0', method: 'test', id: '1' });
      expect(onMessage).not.toHaveBeenCalled();
    });
  });
});
