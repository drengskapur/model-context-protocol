import { describe, expect, it } from 'vitest';
import type { JSONRPCMessage } from './schema.js';
import type { McpTransport, MessageHandler } from './transport.js';

class TestTransport implements McpTransport {
  private connected = false;
  private messageHandlers = new Set<MessageHandler>();
  private errorHandlers = new Set<(error: Error) => void>();

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.messageHandlers.clear();
    this.errorHandlers.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }
    // Simulate sending
    await Promise.resolve();
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  offMessage(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.add(handler);
  }

  offError(handler: (error: Error) => void): void {
    this.errorHandlers.delete(handler);
  }

  async close(): Promise<void> {
    await this.disconnect();
  }

  // Test helper methods
  getMessageHandlers(): Set<MessageHandler> {
    return this.messageHandlers;
  }

  getErrorHandlers(): Set<(error: Error) => void> {
    return this.errorHandlers;
  }

  async simulateError(error: Error): Promise<void> {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }

  async simulateMessage(message: JSONRPCMessage): Promise<void> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }
    for (const handler of this.messageHandlers) {
      try {
        await handler(message);
      } catch (error) {
        if (error instanceof Error) {
          for (const errorHandler of this.errorHandlers) {
            errorHandler(error);
          }
        }
      }
    }
  }
}

describe('McpTransport', () => {
  describe('Connection Management', () => {
    it('should handle basic connection lifecycle', async () => {
      const transport = new TestTransport();
      expect(transport.isConnected()).toBe(false);

      await transport.connect();
      expect(transport.isConnected()).toBe(true);

      await transport.disconnect();
      expect(transport.isConnected()).toBe(false);
    });

    it('should handle close operation', async () => {
      const transport = new TestTransport();
      await transport.connect();
      expect(transport.isConnected()).toBe(true);

      await transport.close();
      expect(transport.isConnected()).toBe(false);
    });

    it('should reject operations when not connected', async () => {
      const transport = new TestTransport();
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
      };
      await expect(transport.send(message)).rejects.toThrow('Transport not connected');
      await expect(transport.simulateMessage(message)).rejects.toThrow('Transport not connected');
    });
  });

  describe('Message Handling', () => {
    it('should manage message handlers', async () => {
      const transport = new TestTransport();
      const handler: MessageHandler = async () => { /* noop */ };
      
      transport.onMessage(handler);
      expect(transport.getMessageHandlers().has(handler)).toBe(true);

      transport.offMessage(handler);
      expect(transport.getMessageHandlers().has(handler)).toBe(false);
    });

    it('should manage error handlers', async () => {
      const transport = new TestTransport();
      const handler = () => { /* noop */ };
      
      transport.onError(handler);
      expect(transport.getErrorHandlers().has(handler)).toBe(true);

      transport.offError(handler);
      expect(transport.getErrorHandlers().has(handler)).toBe(false);
    });

    it('should deliver messages to all handlers', async () => {
      const transport = new TestTransport();
      await transport.connect();

      let count1 = 0;
      let count2 = 0;
      const handler1: MessageHandler = async () => { count1++; };
      const handler2: MessageHandler = async () => { count2++; };

      transport.onMessage(handler1);
      transport.onMessage(handler2);

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
      };
      await transport.simulateMessage(message);
      expect(count1).toBe(1);
      expect(count2).toBe(1);

      transport.offMessage(handler1);
      await transport.simulateMessage(message);
      expect(count1).toBe(1);
      expect(count2).toBe(2);
    });

    it('should deliver errors to all handlers', async () => {
      const transport = new TestTransport();
      let count1 = 0;
      let count2 = 0;
      const handler1 = () => { count1++; };
      const handler2 = () => { count2++; };

      transport.onError(handler1);
      transport.onError(handler2);

      await transport.simulateError(new Error('test'));
      expect(count1).toBe(1);
      expect(count2).toBe(1);

      transport.offError(handler1);
      await transport.simulateError(new Error('test'));
      expect(count1).toBe(1);
      expect(count2).toBe(2);
    });

    it('should handle message handler errors gracefully', async () => {
      const transport = new TestTransport();
      await transport.connect();

      const error = new Error('Handler error');
      const handler: MessageHandler = async () => { throw error; };
      let caughtError: Error | null = null;
      
      transport.onMessage(handler);
      transport.onError((e) => { caughtError = e; });

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
      };
      await transport.simulateMessage(message);
      expect(caughtError).toBe(error);
    });
  });

  describe('Cleanup', () => {
    it('should clean up handlers on disconnect', async () => {
      const transport = new TestTransport();
      const messageHandler: MessageHandler = async () => { /* noop */ };
      const errorHandler = () => { /* noop */ };

      transport.onMessage(messageHandler);
      transport.onError(errorHandler);

      await transport.disconnect();

      expect(transport.getMessageHandlers().size).toBe(0);
      expect(transport.getErrorHandlers().size).toBe(0);
    });

    it('should clean up handlers on close', async () => {
      const transport = new TestTransport();
      const messageHandler: MessageHandler = async () => { /* noop */ };
      const errorHandler = () => { /* noop */ };

      transport.onMessage(messageHandler);
      transport.onError(errorHandler);

      await transport.close();

      expect(transport.getMessageHandlers().size).toBe(0);
      expect(transport.getErrorHandlers().size).toBe(0);
    });
  });
}); 