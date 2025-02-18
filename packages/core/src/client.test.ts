import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpClient } from './client.js';
import { InMemoryTransport } from './in-memory.js';
import type {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCNotification,
  JSONRPCResponse,
  PromptMessage,
  SamplingMessage,
} from './schema.js';
import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from './schema.js';

describe('McpClient', () => {
  let client: McpClient;
  let transport: InMemoryTransport;

  beforeEach(() => {
    client = new McpClient({
      name: 'test-client',
      version: '1.0.0',
      requestTimeout: 1000, // Increased timeout for tests
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
      jsonrpc: '2.0',
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
  });

  it('should handle request cancellation', async () => {
    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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

    const promise = client.callTool('test', {});
    await Promise.resolve();

    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;

    // Simulate cancellation notification
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: {
        requestId: request.id,
        reason: 'Test cancellation',
      },
    } as JSONRPCNotification);

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
    await transport.connect();
    const connectPromise = client.connect(transport);

    // Wait for the initialization message to be sent
    await Promise.resolve();

    // Send the initialization response
    const initResponse: JSONRPCResponse = {
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

    // Wait for the message handler to be registered
    await Promise.resolve();
    await transport.simulateIncomingMessage(initResponse);
    await connectPromise;

    // Simulate a notification message
    const notification: JSONRPCNotification = {
      jsonrpc: JSONRPC_VERSION,
      method: 'test/notification',
      params: { data: 'test' },
    };

    // Send the notification and wait for processing
    await transport.simulateIncomingMessage(notification);
    await Promise.resolve();

    // Verify the handler was called with both messages
    expect(messageHandler).toHaveBeenCalledTimes(2);
    expect(messageHandler).toHaveBeenNthCalledWith(1, initResponse);
    expect(messageHandler).toHaveBeenNthCalledWith(2, notification);

    client.offMessage(messageHandler);
  });

  it('should handle initialization error', async () => {
    const connectPromise = client.connect(transport);
    await Promise.resolve();

    // Simulate error response during initialization
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32600,
        message: 'Invalid Request',
      },
    });

    await expect(connectPromise).rejects.toThrow('Invalid Request');
  });

  it('should handle multiple concurrent requests', async () => {
    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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

    // Make multiple concurrent requests
    const promise1 = client.callTool('test1', {});
    const promise2 = client.callTool('test2', {});
    await Promise.resolve();

    const messages = transport.getMessages();
    const request1 = messages[messages.length - 2] as JSONRPCRequest;
    const request2 = messages[messages.length - 1] as JSONRPCRequest;

    // Simulate responses in reverse order
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: request2.id,
      result: { success: true, id: 2 },
    } as JSONRPCResponse);

    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: request1.id,
      result: { success: true, id: 1 },
    } as JSONRPCResponse);

    const [result1, result2] = await Promise.all([promise1, promise2]);
    expect(result1).toEqual({ success: true, id: 1 });
    expect(result2).toEqual({ success: true, id: 2 });
  });

  it('should handle progress notifications', async () => {
    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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
    const progressToken = 'test-progress';
    client.onProgress(progressToken, progressHandler);

    // Simulate progress notification
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
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
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
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

    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;
    expect(request.method).toBe('tools/list');

    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
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
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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

    await expect(client.listTools()).rejects.toThrow(
      'Server does not support tool listing'
    );
  });

  it('should handle tool calls with progress', async () => {
    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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

    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;
    const progressToken = request.params?._meta?.progressToken;

    // Simulate progress notification
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: {
        progressToken,
        progress: 75,
        total: 100,
      },
    } as JSONRPCNotification);

    // Simulate successful response
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: request.id,
      result: { success: true },
    } as JSONRPCResponse);

    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(progressHandler).toHaveBeenCalledWith(75, 100);
  });

  it('should handle request timeout', async () => {
    // First initialize the client with a short timeout
    client = new McpClient({
      name: 'test-client',
      version: '1.0.0',
      requestTimeout: 100, // Very short timeout for testing
    });

    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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

    const promise = client.callTool('test', {});
    await Promise.resolve();

    await expect(promise).rejects.toThrow('Request timed out after 100ms');
  });

  it('should reject requests when not connected', async () => {
    // Create a new client to ensure clean state
    const newClient = new McpClient({
      name: 'test-client',
      version: '1.0.0',
    });

    // Don't connect at all
    await expect(newClient.callTool('test', {})).rejects.toThrow(
      'Client not connected'
    );
  });

  it('should reject requests when not initialized', async () => {
    await transport.connect();
    client.connect(transport); // Don't await, so initialization isn't complete
    await Promise.resolve();

    await expect(client.callTool('test', {})).rejects.toThrow(
      'Client not initialized'
    );
  });

  it('should handle protocol version mismatch', async () => {
    const connectPromise = client.connect(transport);
    await Promise.resolve();

    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '0.1.0', // Different version
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    } as JSONRPCResponse);

    await expect(connectPromise).rejects.toThrow(/Protocol version mismatch/);
  });

  it('should handle logging level setting', async () => {
    // First initialize the client with logging capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
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

    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;
    expect(request.method).toBe('logging/setLevel');
    expect(request.params).toEqual({ level: 'info' });

    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: request.id,
      result: {},
    } as JSONRPCResponse);

    await setLevelPromise;
  });

  it('should reject logging when not supported', async () => {
    // First initialize the client without logging capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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

    await expect(client.setLoggingLevel('info')).rejects.toThrow(
      'Server does not support logging'
    );
  });

  it('should handle disconnect', async () => {
    // Create a new client to ensure clean state
    const newClient = new McpClient({
      name: 'test-client',
      version: '1.0.0',
    });

    // First initialize the client
    await transport.connect();
    const connectPromise = newClient.connect(transport);
    await Promise.resolve();
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
    } as JSONRPCResponse);
    await connectPromise;

    // Ensure we're fully connected
    await Promise.resolve();

    // Disconnect
    await newClient.disconnect();
    await transport.disconnect();

    // Ensure we're fully disconnected
    await Promise.resolve();

    // Verify that the client rejects requests after disconnect
    await expect(newClient.callTool('test', {})).rejects.toThrow(
      'Client not connected'
    );
  });

  it('should reject double initialization', async () => {
    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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

    // Try to initialize again
    await expect(client.connect(transport)).rejects.toThrow(
      'Client already initialized'
    );
  });

  it('should handle invalid response without id', async () => {
    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve();
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
    await transport.simulateIncomingMessage(invalidMessage);

    // The promise should still be pending
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 100));
    await timeoutPromise;
    expect(promise).not.toHaveProperty('_state', 'fulfilled');
  });

  it('should handle invalid response with wrong id', async () => {
    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve();
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
    } as JSONRPCResponse);
    await connectPromise;

    // Make a request
    const promise = client.callTool('test', {});
    await Promise.resolve();

    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;

    // Simulate response with wrong id
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: typeof request.id === 'number' ? request.id + 1 : '0',
      result: { success: true },
    } as JSONRPCResponse);

    // The promise should still be pending
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 100));
    await timeoutPromise;
    expect(promise).not.toHaveProperty('_state', 'fulfilled');
  });

  it('should handle invalid response with wrong jsonrpc version', async () => {
    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve();
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
    } as JSONRPCResponse);
    await connectPromise;

    // Make a request
    const promise = client.callTool('test', {});
    await Promise.resolve();

    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;

    // Simulate response with wrong jsonrpc version
    await transport.simulateIncomingMessage({
      jsonrpc: '1.0', // Wrong version
      id: request.id,
      result: { success: true },
    } as unknown as JSONRPCResponse);

    // The promise should still be pending
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 100));
    await timeoutPromise;
    expect(promise).not.toHaveProperty('_state', 'fulfilled');
  });

  it('should handle invalid response with missing result and error', async () => {
    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve();
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
    } as JSONRPCResponse);
    await connectPromise;

    // Make a request
    const promise = client.callTool('test', {});
    await Promise.resolve();

    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;

    // Simulate response with neither result nor error
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
    } as unknown as JSONRPCResponse);

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
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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

    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;
    const progressToken = request.params?._meta?.progressToken;

    // Simulate successful response
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: request.id,
      result: { success: true },
    } as JSONRPCResponse);

    await promise;

    // Progress handler should be cleaned up
    await transport.simulateIncomingMessage({
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
    await transport.connect();
    const connectPromise = client.connect(transport);

    // Set up handlers
    transport.onError(errorHandler);
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
    await transport.simulateIncomingMessage(response);
    await Promise.resolve();

    // The message handler should have been called
    expect(messageHandler).toHaveBeenCalledWith(response);
    // The error should be reported to the transport
    expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    expect(errorHandler.mock.calls[0][0].message).toBe('Handler error');

    // The client should still be able to complete initialization
    await connectPromise;

    // Clean up
    transport.offError(errorHandler);
    client.offMessage(messageHandler);
  });

  it('should handle multiple message handlers', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    client.onMessage(handler1);
    client.onMessage(handler2);

    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve();

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

    await transport.simulateIncomingMessage(response);
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

    await transport.simulateIncomingMessage(notification);
    await Promise.resolve();

    // Only handler2 should receive the notification
    expect(handler1).not.toHaveBeenCalledWith(notification);
    expect(handler2).toHaveBeenCalledWith(notification);
  });

  it('should handle transport errors during send', async () => {
    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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

    // Mock transport.send to throw an error
    const error = new Error('Send failed');
    const originalSend = transport.send;
    transport.send = vi.fn().mockRejectedValue(error);

    await expect(client.callTool('test', {})).rejects.toThrow('Send failed');

    // Restore original send
    transport.send = originalSend;
  });

  it('should handle transport errors during connect', async () => {
    // Mock transport.connect to throw an error
    const error = new Error('Connect failed');
    const originalConnect = transport.connect;
    transport.connect = vi.fn().mockRejectedValue(error);

    await expect(client.connect(transport)).rejects.toThrow('Connect failed');

    // Restore original connect
    transport.connect = originalConnect;
  });

  it('should handle transport errors during disconnect', async () => {
    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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

    // Mock transport.disconnect to throw an error
    const error = new Error('Disconnect failed');
    const originalDisconnect = transport.disconnect;
    transport.disconnect = vi.fn().mockRejectedValue(error);

    await expect(client.disconnect()).rejects.toThrow('Disconnect failed');

    // Restore original disconnect
    transport.disconnect = originalDisconnect;
  });

  it('should handle unhandled notification methods', async () => {
    const messageHandler = vi.fn();
    client.onMessage(messageHandler);

    // First initialize the client
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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

    await transport.simulateIncomingMessage(notification);

    // The message should still be passed to handlers
    expect(messageHandler).toHaveBeenCalledWith(notification);
  });

  it('should handle malformed progress notifications', async () => {
    const progressHandler = vi.fn();
    const progressToken = 'test-progress';

    // First initialize the client
    await transport.connect();
    const connectPromise = client.connect(transport);
    await Promise.resolve();
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
    await transport.simulateIncomingMessage(malformedNotification);
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

    await transport.simulateIncomingMessage(validNotification);
    await Promise.resolve();

    // The progress handler should be called with valid data
    expect(progressHandler).toHaveBeenCalledWith(50, 100);

    // Clean up
    client.offProgress(progressToken);
  });

  it('should handle prompt listing', async () => {
    // First initialize the client with prompts capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
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

    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;
    expect(request.method).toBe('prompts/list');

    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        prompts: [
          {
            name: 'test-prompt',
            description: 'A test prompt',
            arguments: [
              {
                name: 'arg1',
                description: 'First argument',
                required: true,
              },
            ],
          },
        ],
      },
    } as JSONRPCResponse);

    const prompts = await listPromise;
    expect(prompts).toHaveLength(1);
    expect(prompts[0].name).toBe('test-prompt');
    expect(prompts[0].arguments?.[0].name).toBe('arg1');
  });

  it('should handle getting a prompt', async () => {
    // First initialize the client with prompts capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
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

    // Set up the response for prompts/get
    const getPromise = client.getPrompt('test-prompt', { arg1: 'value1' });
    await Promise.resolve();

    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;
    expect(request.method).toBe('prompts/get');
    expect(request.params).toEqual({
      name: 'test-prompt',
      arguments: { arg1: 'value1' },
    });

    const promptMessages: PromptMessage[] = [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Test message with arg1: value1',
        },
      },
    ];

    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        description: 'Test prompt description',
        messages: promptMessages,
      },
    } as JSONRPCResponse);

    const result = await getPromise;
    expect(result.description).toBe('Test prompt description');
    expect(result.messages).toEqual(promptMessages);
  });

  it('should handle executing a prompt', async () => {
    // First initialize the client with prompts capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
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

    const progressHandler = vi.fn();
    const executePromise = client.executePrompt(
      'test-prompt',
      { arg1: 'value1' },
      progressHandler
    );
    await Promise.resolve();

    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;
    expect(request.method).toBe('prompts/execute');
    expect(request.params?.name).toBe('test-prompt');
    expect(request.params?.arguments).toEqual({ arg1: 'value1' });
    const progressToken = request.params?._meta?.progressToken;
    expect(progressToken).toBeDefined();

    // Simulate progress notification
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: {
        progressToken,
        progress: 50,
        total: 100,
      },
    } as JSONRPCNotification);

    const promptMessages: PromptMessage[] = [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Test message with arg1: value1',
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: 'Response to the test message',
        },
      },
    ];

    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        messages: promptMessages,
      },
    } as JSONRPCResponse);

    const result = await executePromise;
    expect(result.messages).toEqual(promptMessages);
    expect(progressHandler).toHaveBeenCalledWith(50, 100);
  });

  it('should reject prompt operations when not supported', async () => {
    // First initialize the client without prompts capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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

    await expect(client.listPrompts()).rejects.toThrow(
      'Server does not support prompts'
    );
    await expect(client.getPrompt('test')).rejects.toThrow(
      'Server does not support prompts'
    );
    await expect(client.executePrompt('test')).rejects.toThrow(
      'Server does not support prompts'
    );
  });

  it('should handle resource listing', async () => {
    // First initialize the client with resources capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {
          resources: {
            listChanged: true,
          },
        },
      },
    } as JSONRPCResponse);
    await connectPromise;

    // Set up the response for resources/list
    const listPromise = client.listResources();
    await Promise.resolve();

    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;
    expect(request.method).toBe('resources/list');

    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        resources: ['resource1', 'resource2'],
      },
    } as JSONRPCResponse);

    const resources = await listPromise;
    expect(resources).toEqual(['resource1', 'resource2']);
  });

  it('should handle reading a resource', async () => {
    // First initialize the client with resources capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {
          resources: {
            listChanged: true,
          },
        },
      },
    } as JSONRPCResponse);
    await connectPromise;

    // Set up the response for resources/read
    const readPromise = client.readResource('test-resource');
    await Promise.resolve();

    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;
    expect(request.method).toBe('resources/read');
    expect(request.params).toEqual({ name: 'test-resource' });

    const resourceContent = { key: 'value' };
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: resourceContent,
      },
    } as JSONRPCResponse);

    const content = await readPromise;
    expect(content).toEqual(resourceContent);
  });

  it('should handle resource subscription', async () => {
    // First initialize the client with resources capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {
          resources: {
            listChanged: true,
          },
        },
      },
    } as JSONRPCResponse);
    await connectPromise;

    const onChange = vi.fn();
    const subscribePromise = client.subscribeToResource(
      'test-resource',
      onChange
    );
    await Promise.resolve();

    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;
    expect(request.method).toBe('resources/subscribe');
    expect(request.params).toEqual({ name: 'test-resource' });

    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: request.id,
      result: {},
    } as JSONRPCResponse);

    const cleanup = await subscribePromise;
    expect(typeof cleanup).toBe('function');

    // Simulate resource change
    const newContent = { key: 'new-value' };
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/resources/updated',
      params: {
        uri: 'test-resource',
        content: newContent,
      },
    } as JSONRPCNotification);

    expect(onChange).toHaveBeenCalledWith(newContent);

    // Test cleanup
    cleanup();
    await Promise.resolve();

    const unsubscribeRequest = transport.getMessages()[
      transport.getMessages().length - 1
    ] as JSONRPCRequest;
    expect(unsubscribeRequest.method).toBe('resources/unsubscribe');
    expect(unsubscribeRequest.params).toEqual({ uri: 'test-resource' });
  });

  it('should reject resource operations when not supported', async () => {
    // First initialize the client without resources capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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

    await expect(client.listResources()).rejects.toThrow(
      'Server does not support resources'
    );
    await expect(client.readResource('test')).rejects.toThrow(
      'Server does not support resources'
    );
    await expect(client.subscribeToResource('test', () => {})).rejects.toThrow(
      'Server does not support resources'
    );
  });

  it('should handle roots listing', async () => {
    // First initialize the client with roots capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {
          roots: {
            listChanged: true,
          },
        },
      },
    } as JSONRPCResponse);
    await connectPromise;

    // Set up the response for roots/list
    const listPromise = client.listRoots();
    await Promise.resolve();

    const messages = transport.getMessages();
    const request = messages[messages.length - 1] as JSONRPCRequest;
    expect(request.method).toBe('roots/list');

    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        roots: ['/path/to/root1', '/path/to/root2'],
      },
    } as JSONRPCResponse);

    const roots = await listPromise;
    expect(roots).toEqual(['/path/to/root1', '/path/to/root2']);
  });

  it('should handle roots change notifications', async () => {
    // First initialize the client with roots capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {
          roots: {
            listChanged: true,
          },
        },
      },
    } as JSONRPCResponse);
    await connectPromise;

    const onChange = vi.fn();
    const cleanup = client.onRootsChanged(onChange);

    // Simulate roots change notification
    const newRoots = ['/path/to/root1', '/path/to/root2'];
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      method: 'notifications/rootsChanged',
      params: {
        roots: newRoots,
      },
    } as JSONRPCNotification);

    expect(onChange).toHaveBeenCalledWith(newRoots);

    // Test cleanup
    cleanup();
    await Promise.resolve();

    // Simulate another change - handler should not be called
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      method: 'notifications/rootsChanged',
      params: {
        roots: ['/path/to/root3'],
      },
    } as JSONRPCNotification);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('should reject roots operations when not supported', async () => {
    // First initialize the client without roots capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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

    await expect(client.listRoots()).rejects.toThrow(
      'Server does not support roots'
    );
    expect(() => client.onRootsChanged(() => {})).toThrow(
      'Server does not support roots'
    );
  });

  it('should handle message creation', async () => {
    // First initialize the client with sampling capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {
          sampling: {
            createMessage: true,
          },
        },
      },
    } as JSONRPCResponse);
    await connectPromise;

    const messages: SamplingMessage[] = [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Hello, world!',
        },
      },
    ];

    const progressHandler = vi.fn();
    const createPromise = client.createMessage(messages, {
      systemPrompt: 'You are a helpful assistant.',
      temperature: 0.7,
      maxTokens: 100,
      progressHandler,
    });
    await Promise.resolve();

    const requestMessages = transport.getMessages();
    const request = requestMessages[
      requestMessages.length - 1
    ] as JSONRPCRequest;
    expect(request.method).toBe('sampling/createMessage');
    expect(request.params).toMatchObject({
      messages,
      systemPrompt: 'You are a helpful assistant.',
      temperature: 0.7,
      maxTokens: 100,
    });
    expect(request.params?._meta?.progressToken).toBeDefined();

    // Simulate progress
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: {
        progressToken: request.params?._meta?.progressToken,
        progress: 50,
        total: 100,
      },
    } as JSONRPCNotification);

    const response: SamplingMessage = {
      role: 'assistant',
      content: {
        type: 'text',
        text: 'Hello! How can I help you today?',
      },
    };

    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        message: response,
      },
    } as JSONRPCResponse);

    const result = await createPromise;
    expect(result).toEqual(response);
    expect(progressHandler).toHaveBeenCalledWith(50, 100);
  });

  it('should handle message creation notifications', async () => {
    // First initialize the client with sampling capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {
          sampling: {
            createMessage: true,
          },
        },
      },
    } as JSONRPCResponse);
    await connectPromise;

    const handler = vi.fn();
    const cleanup = client.onMessageCreated(handler);

    const message: SamplingMessage = {
      role: 'assistant',
      content: {
        type: 'text',
        text: 'Hello! How can I help you today?',
      },
    };

    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      method: 'notifications/messageCreated',
      params: {
        message,
      },
    } as JSONRPCNotification);

    expect(handler).toHaveBeenCalledWith(message);

    // Test cleanup
    cleanup();
    await Promise.resolve();

    // Handler should not be called after cleanup
    await transport.simulateIncomingMessage({
      jsonrpc: '2.0',
      method: 'notifications/messageCreated',
      params: {
        message,
      },
    } as JSONRPCNotification);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should reject sampling operations when not supported', async () => {
    // First initialize the client without sampling capability
    const connectPromise = client.connect(transport);
    await Promise.resolve();
    await transport.simulateIncomingMessage({
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

    const messages: SamplingMessage[] = [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Hello, world!',
        },
      },
    ];

    await expect(client.createMessage(messages)).rejects.toThrow(
      'Server does not support sampling'
    );
    expect(() => client.onMessageCreated(() => {})).toThrow(
      'Server does not support sampling'
    );
  });
});

describe('McpClient with Authorization', () => {
  let client: McpClient;
  let transport: InMemoryTransport;

  beforeEach(async () => {
    transport = new InMemoryTransport();
    client = new McpClient({
      name: 'test-client',
      version: '1.0.0',
    });
    await client.connect(transport);
  });

  it('should set and clear auth token', () => {
    const token = 'test-token';
    client.setAuthToken(token);

    // Token should be included in request params
    const request = client['prepareRequest']('test-method', { data: 'test' });
    expect(request).resolves.toHaveProperty('params.token', token);

    client.clearAuthToken();
    const requestWithoutToken = client['prepareRequest']('test-method', {
      data: 'test',
    });
    expect(requestWithoutToken).resolves.not.toHaveProperty('params.token');
  });

  it('should include token in tool invocations', async () => {
    const token = 'test-token';
    client.setAuthToken(token);

    const mockResponse = { result: 'success' };
    transport.onMessage = async (msg) => {
      const request = msg as unknown as JSONRPCRequest;
      expect(request.params).toHaveProperty('token', token);
      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        result: mockResponse,
      };
    };

    const result = await client.invokeTool('test-tool', { data: 'test' });
    expect(result).toEqual(mockResponse);
  });

  it('should handle token in non-object params', async () => {
    const token = 'test-token';
    client.setAuthToken(token);

    const request = await client['prepareRequest']('test-method', 'test-data');
    expect(request.params).toEqual({
      token,
      data: 'test-data',
    });
  });

  it('should maintain token across multiple requests', async () => {
    const token = 'test-token';
    client.setAuthToken(token);

    const mockResponse = { result: 'success' };
    let requestCount = 0;
    transport.onMessage = async (msg) => {
      const request = msg as unknown as JSONRPCRequest;
      expect(request.params).toHaveProperty('token', token);
      requestCount++;
      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        result: mockResponse,
      };
    };

    await client.invokeTool('test-tool-1', { data: 'test1' });
    await client.invokeTool('test-tool-2', { data: 'test2' });
    expect(requestCount).toBe(2);
  });
});
