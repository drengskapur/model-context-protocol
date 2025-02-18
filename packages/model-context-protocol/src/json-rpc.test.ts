/**
 * @file json-rpc.test.ts
 * @description Test suite for JSON-RPC transport implementation.
 * Contains unit tests for JSON-RPC message handling and transport functionality.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonRpcTransport } from './json-rpc';
import type { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse } from './schema';

class TestTransport extends JsonRpcTransport {
  public messages: (JSONRPCRequest | JSONRPCResponse)[] = [];
  public shouldFail = false;

  send(message: JSONRPCRequest | JSONRPCResponse): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Send failed');
    }
    this.messages.push(message);
    return Promise.resolve();
  }

  connect(): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Connect failed');
    }
    this.setConnected(true);
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Disconnect failed');
    }
    this.setConnected(false);
    return Promise.resolve();
  }

  public simulateIncomingMessage(
    message: JSONRPCMessage,
    shouldFail = false
  ): void {
    if (shouldFail) {
      throw new Error('Message handling failed');
    }
    this.handleMessage(message);
  }
}

describe('JsonRpcTransport', () => {
  let transport: TestTransport;

  beforeEach(() => {
    transport = new TestTransport();
  });

  afterEach(() => {
    transport.disconnect();
  });

  describe('connection management', () => {
    it('should connect successfully', async () => {
      await transport.connect();
      expect(transport.isConnected()).toBe(true);
    });

    it('should handle connection failures', async () => {
      transport.shouldFail = true;
      await expect(transport.connect()).rejects.toThrow('Connect failed');
      expect(transport.isConnected()).toBe(false);
    });

    it('should disconnect successfully', async () => {
      await transport.connect();
      await transport.disconnect();
      expect(transport.isConnected()).toBe(false);
    });

    it('should handle disconnection failures', async () => {
      await transport.connect();
      transport.shouldFail = true;
      await expect(transport.disconnect()).rejects.toThrow('Disconnect failed');
    });
  });

  describe('message handling', () => {
    it('should handle incoming messages', () => {
      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);

      const testMessage: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
        id: 1,
      };

      transport.simulateIncomingMessage(testMessage);
      expect(messageHandler).toHaveBeenCalledWith(testMessage);
    });

    it('should handle message sending', async () => {
      await transport.connect();

      const testMessage: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
        id: 1,
      };

      await transport.send(testMessage);
      expect(transport.messages).toContainEqual(testMessage);
    });

    it('should handle send failures', async () => {
      await transport.connect();
      transport.shouldFail = true;

      const testMessage: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
        id: 1,
      };

      await expect(transport.send(testMessage)).rejects.toThrow('Send failed');
    });

    it('should handle message handling failures', () => {
      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);

      const testMessage: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
        id: 1,
      };

      expect(() =>
        transport.simulateIncomingMessage(testMessage, true)
      ).toThrow('Message handling failed');
    });
  });
});
