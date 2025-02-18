import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseTransport } from './base';
import type { JSONRPCRequest, JSONRPCResponse } from './schema';

class TestTransport extends BaseTransport {
  public messages: (JSONRPCRequest | JSONRPCResponse)[] = [];
  public shouldFail = false;

  async send(message: JSONRPCRequest | JSONRPCResponse): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Send failed');
    }
    this.messages.push(message);
  }

  async connect(): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Connect failed');
    }
    this.setConnected(true);
  }

  async disconnect(): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Disconnect failed');
    }
    this.setConnected(false);
  }

  public simulateMessage(message: JSONRPCRequest): void {
    this.handleMessage(message);
  }

  public simulateError(error: Error): void {
    this.handleError(error);
  }
}

describe('BaseTransport', () => {
  let transport: TestTransport;

  beforeEach(() => {
    transport = new TestTransport();
  });

  afterEach(() => {
    transport.events.removeAllListeners();
  });

  describe('connection management', () => {
    it('should start disconnected', () => {
      expect(transport.isConnected()).toBe(false);
    });

    it('should connect successfully', async () => {
      const onConnect = vi.fn();
      transport.on('connect', onConnect);
      await transport.connect();
      expect(transport.isConnected()).toBe(true);
      expect(onConnect).toHaveBeenCalled();
    });

    it('should handle connection failure', async () => {
      transport.shouldFail = true;
      await expect(transport.connect()).rejects.toThrow('Connect failed');
      expect(transport.isConnected()).toBe(false);
    });

    it('should disconnect successfully', async () => {
      await transport.connect();
      const onDisconnect = vi.fn();
      transport.on('disconnect', onDisconnect);
      await transport.disconnect();
      expect(transport.isConnected()).toBe(false);
      expect(onDisconnect).toHaveBeenCalled();
    });

    it('should handle disconnection failure', async () => {
      await transport.connect();
      transport.shouldFail = true;
      await expect(transport.disconnect()).rejects.toThrow('Disconnect failed');
      expect(transport.isConnected()).toBe(true);
    });
  });

  describe('message handling', () => {
    it('should send messages successfully', async () => {
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };
      await transport.send(message);
      expect(transport.messages).toContain(message);
    });

    it('should handle send failure', async () => {
      transport.shouldFail = true;
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };
      await expect(transport.send(message)).rejects.toThrow('Send failed');
    });

    it('should emit message events', () => {
      const onMessage = vi.fn();
      transport.on('message', onMessage);
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };
      transport.simulateMessage(message);
      expect(onMessage).toHaveBeenCalledWith(message);
    });

    it('should stop emitting messages after unsubscribe', () => {
      const onMessage = vi.fn();
      transport.on('message', onMessage);
      transport.off('message', onMessage);
      transport.simulateMessage({ jsonrpc: '2.0', method: 'test', id: 1 });
      expect(onMessage).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should emit error events', () => {
      const onError = vi.fn();
      transport.on('error', onError);
      const error = new Error('Test error');
      transport.simulateError(error);
      expect(onError).toHaveBeenCalledWith(error);
    });

    it('should stop emitting errors after unsubscribe', () => {
      const onError = vi.fn();
      transport.on('error', onError);
      transport.off('error', onError);
      transport.simulateError(new Error('Test error'));
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('event handling', () => {
    it('should support multiple event listeners', () => {
      const onMessage1 = vi.fn();
      const onMessage2 = vi.fn();
      transport.on('message', onMessage1);
      transport.on('message', onMessage2);
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };
      transport.simulateMessage(message);
      expect(onMessage1).toHaveBeenCalledWith(message);
      expect(onMessage2).toHaveBeenCalledWith(message);
    });

    it('should only remove specified listener', () => {
      const onMessage1 = vi.fn();
      const onMessage2 = vi.fn();
      transport.on('message', onMessage1);
      transport.on('message', onMessage2);
      transport.off('message', onMessage1);
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };
      transport.simulateMessage(message);
      expect(onMessage1).not.toHaveBeenCalled();
      expect(onMessage2).toHaveBeenCalledWith(message);
    });
  });
});
