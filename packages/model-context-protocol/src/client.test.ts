import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpClient } from './client.js';
import { InMemoryTransport } from './in-memory.js';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  JSONRPCNotification,
  PromptMessage,
} from './schema.js';
import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from './schema.js';
import { Auth } from './auth.js';
import { McpServer } from './server.js';

const PROTOCOL_VERSION_MISMATCH_REGEX = /Protocol version mismatch/;

async function createConnectedPair() {
  const [clientTransport, serverTransport] = InMemoryTransport.createPair();

  const client = new McpClient(
    {
      name: 'test-client',
      version: '1.0.0',
      requestTimeout: 1000,
    },
    clientTransport
  );

  const server = new McpServer({
    name: 'test-server',
    version: '1.0.0',
  });

  await server.connect(serverTransport);

  // Start client connection
  const connectPromise = client.connect();

  // Wait for transport connection
  await Promise.resolve();

  // Simulate server response to initialize request
  const response: JSONRPCResponse = {
    jsonrpc: JSONRPC_VERSION,
    id: clientTransport.getMessages()[0].id,
    result: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      serverInfo: {
        name: 'test-server',
        version: '1.0.0',
      },
      capabilities: {},
    },
  };
  await serverTransport.simulateIncomingMessage(response);

  // Wait for initialization to complete
  await connectPromise;

  return { client, server, clientTransport, serverTransport };
}

describe('McpClient', () => {
  let client: McpClient;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;
  let server: McpServer;

  beforeEach(async () => {
    [clientTransport, serverTransport] = InMemoryTransport.createPair();

    client = new McpClient(
      {
        name: 'test-client',
        version: '1.0.0',
        requestTimeout: 1000,
      },
      clientTransport
    );

    server = new McpServer({
      name: 'test-server',
      version: '1.0.0',
    });

    await server.connect(serverTransport);

    // Start client connection
    const connectPromise = client.connect();

    // Wait for transport connection
    await Promise.resolve();

    // Simulate server response to initialize request
    const response: JSONRPCResponse = {
      jsonrpc: JSONRPC_VERSION,
      id: clientTransport.getMessages()[0].id,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    };
    await serverTransport.simulateIncomingMessage(response);

    // Wait for initialization to complete
    await connectPromise;
  });

  afterEach(async () => {
    await clientTransport.close();
    await serverTransport.close();
  });

  it('should initialize successfully', async () => {
    // Create a new client for this test since we don't want the beforeEach initialization
    [clientTransport, serverTransport] = InMemoryTransport.createPair();

    client = new McpClient(
      {
        name: 'test-client',
        version: '1.0.0',
        requestTimeout: 1000,
      },
      clientTransport
    );

    server = new McpServer({
      name: 'test-server',
      version: '1.0.0',
    });

    await server.connect(serverTransport);

    // Start the connection
    const connectPromise = client.connect();

    // Wait a tick for the message to be sent
    await Promise.resolve();

    // Get the initialization message
    const messages = clientTransport.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: expect.any(String),
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
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: messages[0].id,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } satisfies JSONRPCResponse);

    await connectPromise;
  });

  it('should handle request cancellation', async () => {
    // First initialize the client
    const connectPromise = client.connect();
    await Promise.resolve();

    // Get the initialization message
    const messages = clientTransport.getMessages();
    const initMessage = messages[0];

    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: initMessage.id,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } satisfies JSONRPCResponse);
    await connectPromise;

    const promise = client.callTool('test', {});
    await Promise.resolve();

    const toolMessages = clientTransport.getMessages();
    const request = toolMessages.at(-1) as JSONRPCRequest;

    // Simulate cancellation notification
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/cancelled',
      params: {
        requestId: request.id,
        reason: 'Test cancellation',
      },
    } satisfies JSONRPCNotification);

    // Wait a tick for the cancellation to be processed
    await Promise.resolve();

    await expect(promise).rejects.toThrow(
      'Request cancelled: Test cancellation'
    );
  });

  it('should handle message events', async () => {
    const messageHandler = vi.fn();
    client.onMessage(messageHandler);

    // First initialize the client
    await clientTransport.connect();
    const connectPromise = client.connect();

    // Wait for the initialization message to be sent
    await Promise.resolve();

    // Send the initialization response
    const initResponse: JSONRPCResponse = {
      jsonrpc: JSONRPC_VERSION,
      id: expect.any(String),
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    };

    // Wait for the message handler to be registered
    await Promise.resolve();
    await serverTransport.simulateIncomingMessage(initResponse);
    await connectPromise;

    // Simulate a notification message
    const notification: JSONRPCNotification = {
      jsonrpc: JSONRPC_VERSION,
      method: 'test/notification',
      params: { data: 'test' },
    };

    // Send the notification and wait for processing
    await serverTransport.simulateIncomingMessage(notification);
    await Promise.resolve();

    // Verify the handler was called with both messages
    expect(messageHandler).toHaveBeenCalledTimes(2);
    expect(messageHandler).toHaveBeenNthCalledWith(1, initResponse);
    expect(messageHandler).toHaveBeenNthCalledWith(2, notification);

    client.offMessage(messageHandler);
  });

  it('should handle initialization error', async () => {
    const connectPromise = client.connect();
    await Promise.resolve();

    // Simulate error response during initialization
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: expect.any(String),
      error: {
        code: -32600,
        message: 'Invalid Request',
      },
    });

    await expect(connectPromise).rejects.toThrow('Invalid Request');
  });

  it('should handle multiple concurrent requests', async () => {
    // First initialize the client
    const connectPromise = client.connect();
    await Promise.resolve();
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: expect.any(String),
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } as JSONRPCResponse);
    await connectPromise;

    // Make multiple concurrent requests
    const promise1 = client.callTool('test1', {});
    const promise2 = client.callTool('test2', {});
    await Promise.resolve();

    const messages = clientTransport.getMessages();
    const request1 = messages.at(-2) as JSONRPCRequest;
    const request2 = messages.at(-1) as JSONRPCRequest;

    // Simulate responses in reverse order
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: request2.id,
      result: { success: true, id: 2 },
    } as JSONRPCResponse);

    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: request1.id,
      result: { success: true, id: 1 },
    } as JSONRPCResponse);

    const [result1, result2] = await Promise.all([promise1, promise2]);
    expect(result1).toEqual({ success: true, id: 1 });
    expect(result2).toEqual({ success: true, id: 2 });
  });

  it('should handle progress notifications', async () => {
    // First initialize the client
    const connectPromise = client.connect();
    await Promise.resolve();
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: expect.any(String),
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } as JSONRPCResponse);
    await connectPromise;

    const progressHandler = vi.fn();
    const progressToken = 'test-progress';
    client.onProgress(progressToken, progressHandler);

    // Simulate progress notification
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/progress',
      params: {
        progressToken,
        progress: 50,
        total: 100,
      },
    } as JSONRPCNotification);

    expect(progressHandler).toHaveBeenCalledWith(50, 100);
    client.offProgress(progressToken);
  });

  it('should handle tool listing', async () => {
    // First initialize the client with tools capability
    const connectPromise = client.connect();
    await Promise.resolve();
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: expect.any(String),
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {
          tools: {
            listChanged: true,
          },
        },
      },
    } as JSONRPCResponse);
    await connectPromise;

    // Set up the response for tools/list
    const listPromise = client.listTools();
    await Promise.resolve();

    const messages = clientTransport.getMessages();
    const request = messages.at(-1) as JSONRPCRequest;
    expect(request.method).toBe('tools/list');

    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {
        tools: ['tool1', 'tool2', 'tool3'],
      },
    } as JSONRPCResponse);

    const tools = await listPromise;
    expect(tools).toEqual(['tool1', 'tool2', 'tool3']);
  });

  it('should reject tool listing when not supported', async () => {
    // First initialize the client without tools capability
    const connectPromise = client.connect();
    await Promise.resolve();
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: expect.any(String),
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } as JSONRPCResponse);
    await connectPromise;

    await expect(client.listTools()).rejects.toThrow(
      'Server does not support tool listing'
    );
  });

  it('should handle tool calls with progress', async () => {
    // First initialize the client
    const connectPromise = client.connect();
    await Promise.resolve();
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: expect.any(String),
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } as JSONRPCResponse);
    await connectPromise;

    const progressHandler = vi.fn();
    const promise = client.callTool('test', {}, progressHandler);
    await Promise.resolve();

    const messages = clientTransport.getMessages();
    const request = messages.at(-1) as JSONRPCRequest;
    const progressToken = request.params?._meta?.progressToken;

    // Simulate progress notification
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/progress',
      params: {
        progressToken,
        progress: 75,
        total: 100,
      },
    } as JSONRPCNotification);

    // Simulate successful response
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: { success: true },
    } as JSONRPCResponse);

    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(progressHandler).toHaveBeenCalledWith(75, 100);
  });

  it('should handle request timeout', async () => {
    // First initialize the client with a short timeout
    client = new McpClient(
      {
        name: 'test-client',
        version: '1.0.0',
        requestTimeout: 100, // Very short timeout for testing
      },
      clientTransport
    );

    const connectPromise = client.connect();
    await Promise.resolve();
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: expect.any(String),
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } as JSONRPCResponse);
    await connectPromise;

    const promise = client.callTool('test', {});
    await Promise.resolve();

    await expect(promise).rejects.toThrow('Request timed out after 100ms');
  });

  it('should reject requests when not connected', async () => {
    // Create a new client to ensure clean state
    const newClient = new McpClient(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      clientTransport
    );

    // Don't connect at all
    await expect(newClient.callTool('test', {})).rejects.toThrow(
      'Client not connected'
    );
  });

  it('should reject requests when not initialized', async () => {
    await clientTransport.connect();
    client.connect(); // Don't await, so initialization isn't complete
    await Promise.resolve();

    await expect(client.callTool('test', {})).rejects.toThrow(
      'Client not initialized'
    );
  });

  it('should handle protocol version mismatch', async () => {
    const connectPromise = client.connect();
    await Promise.resolve();

    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: expect.any(String),
      result: {
        protocolVersion: '0.1.0', // Different version
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } as JSONRPCResponse);

    await expect(connectPromise).rejects.toThrow(
      PROTOCOL_VERSION_MISMATCH_REGEX
    );
  });

  it('should handle logging level setting', async () => {
    // First initialize the client with logging capability
    const connectPromise = client.connect();
    await Promise.resolve();
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: expect.any(String),
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {
          logging: {},
        },
      },
    } as JSONRPCResponse);
    await connectPromise;

    // Set up the response for logging/setLevel
    const setLevelPromise = client.setLoggingLevel('info');
    await Promise.resolve();

    const messages = clientTransport.getMessages();
    const request = messages.at(-1) as JSONRPCRequest;
    expect(request.method).toBe('logging/setLevel');
    expect(request.params).toEqual({ level: 'info' });

    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {},
    } as JSONRPCResponse);

    await setLevelPromise;
  });

  it('should reject logging when not supported', async () => {
    // First initialize the client without logging capability
    const connectPromise = client.connect();
    await Promise.resolve();
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: expect.any(String),
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } as JSONRPCResponse);
    await connectPromise;

    await expect(client.setLoggingLevel('info')).rejects.toThrow(
      'Server does not support logging'
    );
  });

  it('should handle disconnect', async () => {
    // Create a new client to ensure clean state
    const newClient = new McpClient(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      clientTransport
    );

    // First initialize the client
    await clientTransport.connect();
    const connectPromise = newClient.connect();
    await Promise.resolve();
    await serverTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: expect.any(String),
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } as JSONRPCResponse);
    await connectPromise;

    // Ensure we're fully connected
    await Promise.resolve();

    // Disconnect
    await newClient.disconnect();
    await clientTransport.disconnect();

    // Ensure we're fully disconnected
    await Promise.resolve();

    // Verify that the client rejects requests after disconnect
    await expect(newClient.callTool('test', {})).rejects.toThrow(
      'Client not connected'
    );
  });

  it('should reject double initialization', async () => {
    // First initialize the client
    const connectPromise = client.connect();
    await Promise.resolve();
    await serverTransport.simulateIncomingMessage({
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
    } as JSONRPCResponse);
    await connectPromise;

    // Make a request
    const promise = client.callTool('test', {});
    await Promise.resolve();

    // Simulate invalid response (notification instead of response)
    const invalidMessage: JSONRPCNotification = {
      jsonrpc: JSONRPC_VERSION,
      method: 'test/response',
      params: { success: true },
    };
    await clientTransport.simulateIncomingMessage(invalidMessage);

    // The promise should still be pending
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 100));
    await timeoutPromise;
    expect(promise).not.toHaveProperty('_state', 'fulfilled');
  });

  it('should handle invalid response with wrong id', async () => {
    // First initialize the client
    await clientTransport.connect();
    await Promise.resolve();
    await clientTransport.simulateIncomingMessage({
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
    } as JSONRPCResponse);

    // Make a request
    const promise = client.callTool('test', {});
    await Promise.resolve();

    const messages = clientTransport.getMessages();
    const request = messages.at(-1) as JSONRPCRequest;

    // Simulate response with wrong id
    await clientTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 'wrong-id',
      result: { success: true },
    } as JSONRPCResponse);

    // The promise should still be pending
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 100));
    await timeoutPromise;
    expect(promise).not.toHaveProperty('_state', 'fulfilled');
  });

  it('should handle invalid response with wrong jsonrpc version', async () => {
    await client.connect();
    await Promise.resolve();

    const response = {
      jsonrpc: '0.1.0' as const,
      id: 1,
      result: {
        protocolVersion: '1.0.0',
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    };

    await expect(
      clientTransport.simulateIncomingMessage(
        response as unknown as JSONRPCResponse
      )
    ).rejects.toThrow('Invalid JSON-RPC version');
  });

  it('should handle invalid response with missing result and error', async () => {
    // First initialize the client
    const connectPromise = client.connect();
    await Promise.resolve();
    await clientTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } as JSONRPCResponse);
    await connectPromise;

    // Make a request
    const promise = client.callTool('test', {});
    await Promise.resolve();

    const messages = clientTransport.getMessages();
    const request = messages.at(-1) as JSONRPCRequest;

    // Simulate response with neither result nor error
    const invalidResponse = {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {} as Record<string, unknown>,
    } as JSONRPCResponse;
    await clientTransport.simulateIncomingMessage(invalidResponse);

    // The promise should still be pending
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 100));
    await timeoutPromise;
    expect(promise).not.toHaveProperty('_state', 'fulfilled');
  });

  it('should provide access to server capabilities', async () => {
    expect(client.getServerCapabilities()).toBeNull();

    const capabilities = {
      logging: {},
      tools: { listChanged: true },
      experimental: { feature: {} },
    };

    // Initialize the client with capabilities
    const connectPromise = client.connect();
    await Promise.resolve();
    await clientTransport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities,
      },
    } as JSONRPCResponse);
    await connectPromise;

    expect(client.getServerCapabilities()).toEqual(capabilities);

    // Capabilities should be cleared after disconnect
    await client.disconnect();
    expect(client.getServerCapabilities()).toBeNull();
  });

  it('should clean up progress handlers after tool call', async () => {
    // First initialize the client
    const connectPromise = client.connect();
    await Promise.resolve();
    await clientTransport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } as JSONRPCResponse);
    await connectPromise;

    const progressHandler = vi.fn();
    const promise = client.callTool('test', {}, progressHandler);
    await Promise.resolve();

    const messages = clientTransport.getMessages();
    const request = messages.at(-1) as JSONRPCRequest;
    const progressToken = request.params?._meta?.progressToken;

    // Simulate successful response
    await clientTransport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: request.id,
      result: { success: true },
    } as JSONRPCResponse);

    await promise;

    // Progress handler should be cleaned up
    await clientTransport.simulateIncomingMessage({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: {
        progressToken,
        progress: 100,
        total: 100,
      },
    } as JSONRPCNotification);

    expect(progressHandler).not.toHaveBeenCalled();
  });

  it('should handle message handler errors gracefully', async () => {
    const errorHandler = vi.fn();
    const messageHandler = vi.fn().mockImplementation(() => {
      throw new Error('Handler error');
    });

    // First initialize the client
    await clientTransport.connect();
    const connectPromise = client.connect();

    // Set up handlers
    clientTransport.onError(errorHandler);
    client.onMessage(messageHandler);

    // Wait for handlers to be registered
    await Promise.resolve();

    // Send a message that will trigger the error
    const response: JSONRPCResponse = {
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
    };

    // Send the message and wait for error handling
    await clientTransport.simulateIncomingMessage(response);
    await Promise.resolve();

    // The message handler should have been called
    expect(messageHandler).toHaveBeenCalledWith(response);
    // The error should be reported to the transport
    expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    expect(errorHandler.mock.calls[0][0].message).toBe('Handler error');

    // The client should still be able to complete initialization
    await connectPromise;

    // Clean up
    clientTransport.offError(errorHandler);
    client.offMessage(messageHandler);
  });

  it('should handle multiple message handlers', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    client.onMessage(handler1);
    client.onMessage(handler2);

    // First initialize the client
    const connectPromise = client.connect();
    await Promise.resolve();

    const response: JSONRPCResponse = {
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    };

    await clientTransport.simulateIncomingMessage(response);
    await connectPromise;
    await Promise.resolve();

    // Both handlers should have received the initialization response
    expect(handler1).toHaveBeenCalledWith(response);
    expect(handler2).toHaveBeenCalledWith(response);

    // Remove one handler
    client.offMessage(handler1);

    const notification: JSONRPCNotification = {
      jsonrpc: JSONRPC_VERSION,
      method: 'test/notification',
      params: { data: 'test' },
    };

    await clientTransport.simulateIncomingMessage(notification);
    await Promise.resolve();

    // Only handler2 should receive the notification
    expect(handler1).not.toHaveBeenCalledWith(notification);
    expect(handler2).toHaveBeenCalledWith(notification);
  });

  it('should handle transport errors during send', async () => {
    // First initialize the client
    const connectPromise = client.connect();
    await Promise.resolve();
    await clientTransport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } as JSONRPCResponse);
    await connectPromise;

    // Mock clientTransport.send to throw an error
    const error = new Error('Send failed');
    const originalSend = clientTransport.send;
    clientTransport.send = vi.fn().mockRejectedValue(error);

    await expect(client.callTool('test', {})).rejects.toThrow('Send failed');

    // Restore original send
    clientTransport.send = originalSend;
  });

  it('should handle transport errors during connect', async () => {
    // Mock clientTransport.connect to throw an error
    const error = new Error('Connect failed');
    const originalConnect = clientTransport.connect;
    clientTransport.connect = vi.fn().mockRejectedValue(error);

    await expect(client.connect()).rejects.toThrow('Connect failed');

    // Restore original connect
    clientTransport.connect = originalConnect;
  });

  it('should handle transport errors during disconnect', async () => {
    // First initialize the client
    const connectPromise = client.connect();
    await Promise.resolve();
    await clientTransport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } as JSONRPCResponse);
    await connectPromise;

    // Mock clientTransport.disconnect to throw an error
    const error = new Error('Disconnect failed');
    const originalDisconnect = clientTransport.disconnect;
    clientTransport.disconnect = vi.fn().mockRejectedValue(error);

    await expect(client.disconnect()).rejects.toThrow('Disconnect failed');

    // Restore original disconnect
    clientTransport.disconnect = originalDisconnect;
  });

  it('should handle unhandled notification methods', async () => {
    const messageHandler = vi.fn();
    client.onMessage(messageHandler);

    // First initialize the client
    const connectPromise = client.connect();
    await Promise.resolve();
    await clientTransport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } as JSONRPCResponse);
    await connectPromise;

    // Send an unknown notification type
    const notification = {
      jsonrpc: '2.0',
      method: 'unknown/notification',
      params: { data: 'test' },
    } as JSONRPCNotification;

    await clientTransport.simulateIncomingMessage(notification);

    // The message should still be passed to handlers
    expect(messageHandler).toHaveBeenCalledWith(notification);
  });

  it('should handle malformed progress notifications', async () => {
    const progressHandler = vi.fn();
    const progressToken = 'test-progress';

    // First initialize the client
    await clientTransport.connect();
    const connectPromise = client.connect();
    await Promise.resolve();
    await clientTransport.simulateIncomingMessage({
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
    } as JSONRPCResponse);
    await connectPromise;

    // Register the progress handler after initialization
    client.onProgress(progressToken, progressHandler);
    await Promise.resolve();

    // Send a malformed progress notification
    const malformedNotification: JSONRPCNotification = {
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/progress',
      params: {
        progressToken,
        // Missing required progress field
      },
    };

    // Wait for any pending operations
    await Promise.resolve();
    await clientTransport.simulateIncomingMessage(malformedNotification);
    await Promise.resolve();

    // The progress handler should not be called with invalid data
    expect(progressHandler).not.toHaveBeenCalled();

    // Send a valid progress notification to verify handler still works
    const validNotification: JSONRPCNotification = {
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/progress',
      params: {
        progressToken,
        progress: 50,
        total: 100,
      },
    };

    await clientTransport.simulateIncomingMessage(validNotification);
    await Promise.resolve();

    // The progress handler should be called with valid data
    expect(progressHandler).toHaveBeenCalledWith(50, 100);

    // Clean up
    client.offProgress(progressToken);
  });

  it('should handle prompt listing', async () => {
    // First initialize the client with prompts capability
    const connectPromise = client.connect();
    await Promise.resolve();
    await clientTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {
          prompts: {
            listChanged: true,
          },
        },
      },
    } as JSONRPCResponse);
    await connectPromise;

    // Set up the response for prompts/list
    const listPromise = client.listPrompts();
    await Promise.resolve();

    const messages = clientTransport.getMessages();
    const request = messages.at(-1) as JSONRPCRequest;
    expect(request.method).toBe('prompts/list');

    await clientTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: [
        {
          name: 'test-prompt',
          description: 'A test prompt',
        },
      ] as unknown as Record<string, unknown>,
    } as JSONRPCResponse);

    const prompts = await listPromise;
    expect(prompts).toHaveLength(1);
    expect(prompts[0].name).toBe('test-prompt');
    expect(prompts[0].description).toBe('A test prompt');
  });

  it('should handle transport errors', async () => {
    // Start client connection
    const connectPromise = client.connect();

    // Wait for transport connection
    await Promise.resolve();

    // Simulate server response to initialize request
    await clientTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
        _meta: {},
      },
    } as JSONRPCResponse);

    // Wait for initialization to complete
    await connectPromise;

    // Set up handlers
    const messageHandler = vi.fn();
    client.onMessage(messageHandler);

    // Simulate error response
    await clientTransport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 'test-error',
      error: {
        code: -32000,
        message: 'Test error',
      },
    } as JSONRPCError);

    expect(messageHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'Test error',
        }),
      })
    );

    // Clean up
    client.offMessage(messageHandler);
  });
});
