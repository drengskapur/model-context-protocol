/**
 * @file json-rpc.test.ts
 * @description Test suite for JSON-RPC transport implementation.
 * Contains unit tests for JSON-RPC message handling and transport functionality.
 */

import { EventEmitter } from 'eventemitter3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonRpcTransport } from './json-rpc';
import type { JSONRPCRequest, JSONRPCResponse } from './schema';
import { JSONRPC_VERSION } from './schema';

class TestJsonRpcTransport extends JsonRpcTransport {
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

  public simulateIncomingMessage(message: JSONRPCRequest | JSONRPCResponse): void {
    this.handleMessage(message as JSONRPCRequest);
  }

  public simulateError(error: Error): void {
    this.handleError(error);
  }
}

describe('JsonRpcTransport', () => {
  let transport: TestJsonRpcTransport;

  beforeEach(() => {
    transport = new TestJsonRpcTransport();
  });

  afterEach(async () => {
    await transport.close();
  });

  describe('connection management', () => {
    it('should handle connect successfully', async () => {
      await transport.connect();
      expect(transport.isConnected()).toBe(true);
    });

    it('should handle disconnect successfully', async () => {
      await transport.connect();
      await transport.disconnect();
      expect(transport.isConnected()).toBe(false);
    });

    it('should emit connect/disconnect events', async () => {
      const connectHandler = vi.fn();
      const disconnectHandler = vi.fn();

      transport.events.on('connect', connectHandler);
      transport.events.on('disconnect', disconnectHandler);

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

  describe('message handling', () => {
    it('should handle incoming messages', async () => {
      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);

      const testMessage: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
        params: { foo: 'bar' }
      };

      transport.simulateIncomingMessage(testMessage);
      expect(messageHandler).toHaveBeenCalledWith(testMessage);
    });

    it('should handle message sending', async () => {
      const testMessage: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
        params: { foo: 'bar' }
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
        params: {}
      };

      await expect(transport.send(testMessage)).rejects.toThrow('Send failed');
    });
  });

  describe('error handling', () => {
    it('should handle errors through error handlers', () => {
      const errorHandler = vi.fn();
      transport.onError(errorHandler);

      const testError = new Error('Test error');
      transport.simulateError(testError);

      expect(errorHandler).toHaveBeenCalledWith(testError);
    });

    it('should allow removing error handlers', () => {
      const errorHandler = vi.fn();
      transport.onError(errorHandler);
      transport.offError(errorHandler);

      const testError = new Error('Test error');
      transport.simulateError(testError);

      expect(errorHandler).not.toHaveBeenCalled();
    });
  });

  describe('event handling', () => {
    it('should allow adding and removing message handlers', () => {
      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);
      transport.offMessage(messageHandler);

      const testMessage: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
        params: {}
      };

      transport.simulateIncomingMessage(testMessage);
      expect(messageHandler).not.toHaveBeenCalled();
    });

    it('should handle multiple message handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      transport.onMessage(handler1);
      transport.onMessage(handler2);

      const testMessage: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
        params: {}
      };

      transport.simulateIncomingMessage(testMessage);
      expect(handler1).toHaveBeenCalledWith(testMessage);
      expect(handler2).toHaveBeenCalledWith(testMessage);
    });
  });
}); 