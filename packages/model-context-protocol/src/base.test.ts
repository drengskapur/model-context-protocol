/**
 * @file base.test.ts
 * @description Test suite for base transport implementation.
 * Contains unit tests for core transport functionality and event handling.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseTransport } from './base';
import type { JSONRPCMessage, JSONRPCRequest } from './schema';
import { JSONRPC_VERSION } from './schema';

class TestBaseTransport extends BaseTransport {
  public messages: JSONRPCMessage[] = [];
  public shouldFail = false;

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Send failed');
    }
    await Promise.resolve(this.messages.push(message));
  }

  async connect(): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Connect failed');
    }
    await Promise.resolve(this.setConnected(true));
  }

  async disconnect(): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Disconnect failed');
    }
    await Promise.resolve(this.setConnected(false));
  }

  async request<T>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (this.shouldFail) {
      throw new Error('Request failed');
    }
    const request: JSONRPCRequest = {
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      method,
      params: params || {},
    };
    await this.send(request);
    return {} as T;
  }

  public simulateMessage(message: JSONRPCRequest): void {
    this.handleMessage(message);
  }

  public simulateError(error: Error): void {
    this.handleError(error);
  }

  public getConnectedState(): boolean {
    return this.connected;
  }
}

describe('BaseTransport', () => {
  let transport: TestBaseTransport;

  beforeEach(() => {
    transport = new TestBaseTransport();
  });

  describe('connection state', () => {
    it('should track connection state correctly', async () => {
      expect(transport.isConnected()).toBe(false);
      await transport.connect();
      expect(transport.isConnected()).toBe(true);
      await transport.disconnect();
      expect(transport.isConnected()).toBe(false);
    });

    it('should emit events on connection state changes', async () => {
      const connectHandler = vi.fn();
      const disconnectHandler = vi.fn();

      transport.on('connect', connectHandler);
      transport.on('disconnect', disconnectHandler);

      await transport.connect();
      expect(connectHandler).toHaveBeenCalledTimes(1);

      await transport.disconnect();
      expect(disconnectHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle connection failures', async () => {
      transport.shouldFail = true;
      await expect(transport.connect()).rejects.toThrow('Connect failed');
      expect(transport.isConnected()).toBe(false);
    });
  });

  describe('event handling', () => {
    it('should handle message events', () => {
      const messageHandler = vi.fn();
      transport.on('message', messageHandler);

      const testMessage: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
        params: {},
      };

      transport.simulateMessage(testMessage);
      expect(messageHandler).toHaveBeenCalledWith(testMessage);
    });

    it('should handle error events', () => {
      const errorHandler = vi.fn();
      transport.on('error', errorHandler);

      const testError = new Error('Test error');
      transport.simulateError(testError);
      expect(errorHandler).toHaveBeenCalledWith(testError);
    });

    it('should allow removing event handlers', () => {
      const messageHandler = vi.fn();
      transport.on('message', messageHandler);
      transport.off('message', messageHandler);

      const testMessage: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
        params: {},
      };

      transport.simulateMessage(testMessage);
      expect(messageHandler).not.toHaveBeenCalled();
    });
  });

  describe('request handling', () => {
    it('should handle requests', async () => {
      await transport.request('test', { foo: 'bar' });
      expect(transport.messages).toHaveLength(1);
      expect(transport.messages[0]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        params: { foo: 'bar' },
      });
    });

    it('should handle request failures', async () => {
      transport.shouldFail = true;
      await expect(transport.request('test')).rejects.toThrow('Request failed');
    });

    it('should handle requests without params', async () => {
      await transport.request('test');
      expect(transport.messages[0]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        method: 'test',
        params: {},
      });
    });
  });

  describe('message sending', () => {
    it('should handle message sending', async () => {
      const testMessage: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
        params: {},
      };

      await transport.send(testMessage);
      expect(transport.messages).toContainEqual(testMessage);
    });

    it('should handle send failures', async () => {
      transport.shouldFail = true;
      const testMessage: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
        params: {},
      };

      await expect(transport.send(testMessage)).rejects.toThrow('Send failed');
    });
  });
});
