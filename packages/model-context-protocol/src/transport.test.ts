/**
 * @file transport.test.ts
 * @description Test suite for the Model Context Protocol transport layer.
 * Contains unit tests for message transport and connection handling.
 * 
 * @copyright 2025 Codeium
 * @license MIT
 */

import { EventEmitter } from 'eventemitter3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse } from './schema';
import { JSONRPC_VERSION } from './schema';
import { BaseTransport } from './transport';
import type { MessageHandler, TransportEventMap } from './transport';

class TestTransport extends BaseTransport {
  public messages: (JSONRPCRequest | JSONRPCResponse)[] = [];
  public shouldFail = false;

  async send(message: JSONRPCRequest | JSONRPCResponse): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Send failed');
    }
    this.messages.push(message);
    this._events.emit('message', message);
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
    return {} as T;
  }

  public simulateMessage(message: JSONRPCMessage): void {
    this._events.emit('message', message);
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

  afterEach(async () => {
    try {
      await transport.close();
    } catch (error) {
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
});
