import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpClient } from './client.js';
import { InMemoryTransport } from './in-memory.js';
import type { JSONRPCMessage, JSONRPCRequest } from './schema.js';
import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from './schema.js';

describe('McpClient', () => {
  let client: McpClient;
  let transport: InMemoryTransport;

  beforeEach(() => {
    client = new McpClient({
      name: 'test-client',
      version: '1.0.0',
      requestTimeout: 100, // Short timeout for tests
    });
    transport = new InMemoryTransport();
  });

  it('should initialize successfully', async () => {
    // Start the connection
    const connectPromise = client.connect(transport);

    // Wait a tick for the message to be sent
    await Promise.resolve();

    // Get the initialization message
    const messages = transport.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
        capabilities: {},
      },
    });

    // Simulate successful response
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    });

    await connectPromise;
  });

  it('should reject initialization with protocol version mismatch', async () => {
    // Start the connection
    const connectPromise = client.connect(transport);

    // Wait a tick for the message to be sent
    await Promise.resolve();

    // Get the initialization message
    const messages = transport.getMessages();
    expect(messages).toHaveLength(1);

    // Simulate response with wrong protocol version
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      result: {
        protocolVersion: '0.1.0',
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    });

    await expect(connectPromise).rejects.toThrow('Protocol version mismatch');
  });

  it('should handle request timeout', async () => {
    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve(); // Wait for init message
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    });
    await connectPromise;

    // Now make a request that will timeout
    const promise = client.callTool('test', {});
    await expect(promise).rejects.toThrow('Request timed out');
  });

  it('should handle progress notifications', async () => {
    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve(); // Wait for init message
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    });
    await connectPromise;

    const progressHandler = vi.fn();
    const promise = client.callTool('test', {}, progressHandler);
    await Promise.resolve(); // Wait for tool request

    // Get the request message
    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;
    const progressToken = request.params?._meta?.progressToken;

    // Simulate progress notification
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/progress',
      params: {
        progressToken,
        progress: 50,
        total: 100,
      },
    });

    // Simulate completion
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: { success: true },
    });

    await promise;
    expect(progressHandler).toHaveBeenCalledWith(50, 100);
  });

  it('should handle request errors', async () => {
    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve(); // Wait for init message
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    });
    await connectPromise;

    const promise = client.callTool('test', {});
    await Promise.resolve(); // Wait for tool request

    // Get the request message
    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;

    // Simulate error response
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      error: {
        code: -32601,
        message: 'Method not found',
      },
    });

    await expect(promise).rejects.toThrow('Method not found');
  });
}); 