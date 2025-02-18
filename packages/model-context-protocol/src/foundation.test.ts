import { describe, expect, it, vi } from 'vitest';
import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from './schema';
import type { JSONRPCRequest, JSONRPCResponse, JSONRPCMessage } from './schema';
import { InMemoryTransport } from './in-memory';
import { McpClient } from './client';
import { McpServer } from './server';

describe('Model Context Protocol Foundation', () => {
  describe('Protocol Versions', () => {
    it('should have a valid JSON-RPC version', () => {
      expect(JSONRPC_VERSION).toBe('2.0');
    });

    it('should have a valid protocol version', () => {
      expect(LATEST_PROTOCOL_VERSION).toBe('2024-11-05');
    });
  });

  describe('Transport Layer', () => {
    it('should create a paired transport', () => {
      const [transport1, transport2] = InMemoryTransport.createPair();
      expect(transport1).toBeInstanceOf(InMemoryTransport);
      expect(transport2).toBeInstanceOf(InMemoryTransport);
    });

    it('should connect and disconnect transports', async () => {
      const [transport1, transport2] = InMemoryTransport.createPair();
      
      await transport1.connect();
      await transport2.connect();
      
      expect(transport1.isConnected()).toBe(true);
      expect(transport2.isConnected()).toBe(true);

      await transport1.disconnect();
      await transport2.disconnect();

      expect(transport1.isConnected()).toBe(false);
      expect(transport2.isConnected()).toBe(false);
    });

    it('should send messages between transports', async () => {
      const [transport1, transport2] = InMemoryTransport.createPair();
      await transport1.connect();
      await transport2.connect();

      const messageHandler = vi.fn();
      transport2.onMessage(messageHandler);

      const message: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test',
        params: { test: true },
      };

      await transport1.send(message);

      expect(messageHandler).toHaveBeenCalledWith(message);
    });

    it('should handle message validation', async () => {
      const [transport1] = InMemoryTransport.createPair();
      await transport1.connect();

      const invalidMessage = {
        jsonrpc: '1.0',
        id: '1',
        method: 'test',
      } as unknown as JSONRPCMessage;

      await expect(transport1.simulateIncomingMessage(invalidMessage)).rejects.toThrow('Invalid message format');
    });
  });

  describe('Client-Server Communication', () => {
    it('should establish a connection', async () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createPair();

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      }, clientTransport);

      const server = new McpServer({
        name: 'test-server',
        version: '1.0.0',
      });

      await server.connect(serverTransport);
      const connectPromise = client.connect();

      // Wait for transport connection and server response
      await connectPromise;
      expect(client.isInitialized()).toBe(true);
    });

    it('should handle protocol version mismatch', async () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createPair();

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      }, clientTransport);

      const server = new McpServer({
        name: 'test-server',
        version: '1.0.0',
      });

      await server.connect(serverTransport);
      const connectPromise = client.connect();

      // Wait for transport connection
      await Promise.resolve();

      // Simulate server response with wrong version
      await serverTransport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: clientTransport.getMessages()[0].id,
        result: {
          protocolVersion: '0.1.0',
          serverInfo: {
            name: 'test-server',
            version: '1.0.0',
          },
          capabilities: {},
        },
      } satisfies JSONRPCResponse);

      await expect(connectPromise).rejects.toThrow(/Protocol version mismatch/);
      expect(client.isInitialized()).toBe(false);
    });

    it('should handle basic request-response', async () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createPair();

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      }, clientTransport);

      const server = new McpServer({
        name: 'test-server',
        version: '1.0.0',
      });

      // Register a test method
      server.registerMethod('test', async () => ({ success: true }));

      await server.connect(serverTransport);
      const connectPromise = client.connect();

      // Wait for transport connection and server response
      await connectPromise;

      // Make a test request
      const result = await client.request('test');
      expect(result).toEqual({ success: true });
    });
  });
}); 