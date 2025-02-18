import { EventEmitter } from 'eventemitter3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseTransport } from './base';
import type { JSONRPCRequest, JSONRPCResponse } from './schema';
import { JSONRPC_VERSION } from './schema';
import type { MessageHandler, TransportEventMap } from './transport';

class TestTransport extends BaseTransport {
  public messages: (JSONRPCRequest | JSONRPCResponse)[] = [];
  public shouldFail = false;
  public readonly events = new EventEmitter<TransportEventMap>();

  send(message: JSONRPCRequest | JSONRPCResponse): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Send failed');
    }
    this.messages.push(message);
    this.events.emit('message', message);
    return Promise.resolve();
  }

  connect(): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Connect failed');
    }
    this.setConnected(true);
    this.events.emit('connect');
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Disconnect failed');
    }
    this.setConnected(false);
    this.events.emit('disconnect');
    return Promise.resolve();
  }

  async request<T>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const request: JSONRPCRequest = {
      jsonrpc: JSONRPC_VERSION,
      id: Math.random().toString(36).slice(2),
      method,
      params,
    };
    await this.send(request);
    return {} as T; // For testing purposes
  }

  on<K extends keyof TransportEventMap>(
    event: K,
    handler: (...args: TransportEventMap[K]) => void
  ): void {
    this.events.on(event, handler);
  }

  off<K extends keyof TransportEventMap>(
    event: K,
    handler: (...args: TransportEventMap[K]) => void
  ): void {
    this.events.off(event, handler);
  }

  public simulateMessage(message: JSONRPCRequest | JSONRPCResponse): void {
    this.events.emit('message', message);
  }

  public simulateError(error: Error): void {
    this.events.emit('error', error);
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
    it('should handle send failure', async () => {
      transport.shouldFail = true;
      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        id: '1',
      };
      await expect(transport.send(message)).rejects.toThrow('Send failed');
    });

    it('should emit message events', async () => {
      const onMessage = vi.fn();
      transport.on('message', onMessage);

      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        id: '1',
        params: {},
      };

      await transport.send(message);
      expect(onMessage).toHaveBeenCalledWith(message);
    });
  });

  describe('event handling', () => {
    it('should support multiple event listeners', async () => {
      const onMessage1 = vi.fn();
      const onMessage2 = vi.fn();
      transport.on('message', onMessage1);
      transport.on('message', onMessage2);

      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        id: '1',
      };

      await transport.send(message);
      expect(onMessage1).toHaveBeenCalledWith(message);
      expect(onMessage2).toHaveBeenCalledWith(message);
    });

    it('should only remove specified listener', async () => {
      const onMessage1 = vi.fn();
      const onMessage2 = vi.fn();
      transport.on('message', onMessage1);
      transport.on('message', onMessage2);
      transport.off('message', onMessage1);

      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        id: '1',
      };

      await transport.send(message);
      expect(onMessage1).not.toHaveBeenCalled();
      expect(onMessage2).toHaveBeenCalledWith(message);
    });
  });
});
