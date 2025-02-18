import { literal, number, object, string, type BaseSchema } from 'valibot';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSONRPCMessage, Prompt, PromptMessage, SamplingMessage } from './schema.js';
import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from './schema.js';
import { Server, McpServer, type Resource as ServerResource } from './server.js';
import type { McpTransport, MessageHandler } from './transport.js';
import { InMemoryTransport } from './in-memory.js';
import { Authorization } from './auth.js';

interface GreetParams {
  name: string;
  age: number;
}

const greetSchema = object({
  name: string(),
  age: number(),
});

class TestTransport implements McpTransport {
  protected transport: InMemoryTransport;

  constructor() {
    this.transport = new InMemoryTransport();
  }

  async connect(): Promise<void> {
    await this.transport.connect();
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    await this.transport.send(message);
  }

  onMessage(handler: MessageHandler): void {
    this.transport.onMessage(handler);
  }

  offMessage(handler: MessageHandler): void {
    this.transport.offMessage(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.transport.onError(handler);
  }

  offError(handler: (error: Error) => void): void {
    this.transport.offError(handler);
  }

  async close(): Promise<void> {
    await this.transport.close();
  }

  async simulateIncomingMessage(message: JSONRPCMessage): Promise<void> {
    await this.transport.simulateIncomingMessage(message);
  }

  getMessages(): JSONRPCMessage[] {
    return this.transport.getMessages();
  }

  clearMessages(): void {
    this.transport.clearMessages();
  }
}

describe('Server', () => {
  let server: Server;
  let transport: InMemoryTransport;

  beforeEach(() => {
    server = new Server({
      name: 'test-server',
      version: '1.0.0',
    });
    transport = new InMemoryTransport();
  });

  it('should handle initialization', async () => {
    const testPrompt: Prompt = {
      name: 'test-prompt',
      description: 'A test prompt',
      arguments: [
        {
          name: 'arg1',
          description: 'First argument',
          required: true,
        },
      ],
    };

    server.prompt(testPrompt);
    await server.connect(transport);

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    });

    // Test listing prompts
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'prompts/list',
      params: {},
    });

    // Test getting a prompt
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      method: 'prompts/get',
      params: {
        name: 'test-prompt',
        arguments: {
          arg1: 'test-value',
        },
      },
    });

    // Test executing a prompt
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 4,
      method: 'prompts/execute',
      params: {
        name: 'test-prompt',
        arguments: {
          arg1: 'test-value',
        },
      },
    });

    // Test getting a non-existent prompt
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 5,
      method: 'prompts/get',
      params: {
        name: 'non-existent-prompt',
      },
    });

    // Test getting a prompt without required argument
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 6,
      method: 'prompts/get',
      params: {
        name: 'test-prompt',
        // Missing required arg1
      },
    });

    // Test executing a prompt without required argument
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 7,
      method: 'prompts/execute',
      params: {
        name: 'test-prompt',
        // Missing required arg1
      },
    });

    const messages = transport.getMessages();

    // Verify initialization response
    expect(messages[0]).toMatchObject({
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

    // Verify prompts list response
    expect(messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      result: {
        prompts: [testPrompt],
      },
    });

    // Verify get prompt response
    expect(messages[2]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      result: {
        description: 'A test prompt',
        messages: expect.any(Array),
      },
    });

    // Verify execute prompt response
    expect(messages[3]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 4,
      result: {
        messages: expect.any(Array),
      },
    });

    // Verify non-existent prompt error
    expect(messages[4]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 5,
      error: {
        code: -32602,
        message: 'Prompt not found: non-existent-prompt',
      },
    });

    // Verify missing argument error for get
    expect(messages[5]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 6,
      error: {
        code: -32602,
        message: 'Missing required argument: arg1',
      },
    });

    // Verify missing argument error for execute
    expect(messages[6]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 7,
      error: {
        code: -32602,
        message: 'Missing required argument: arg1',
      },
    });
  });

  it('should register and expose tools', async () => {
    server.tool('greet', greetSchema, async (params: unknown) => {
      const typedParams = params as GreetParams;
      return `Hello ${typedParams.name}, you are ${typedParams.age} years old`;
    });
    await server.connect(transport);

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    });

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'greet',
      params: {
        name: 'John',
        age: 30,
      },
    });

    expect(transport.messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      result: {
        value: 'Hello John, you are 30 years old',
      },
    });
  });

  it('should handle unknown tools', async () => {
    await server.connect(transport);

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    });

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'unknown',
      params: {},
    });

    expect(transport.messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      error: {
        code: -32601,
        message: 'Method not found',
      },
    });
  });

  it('should reject invalid parameters', async () => {
    server.tool('greet', greetSchema, async (params: unknown) => {
      const typedParams = params as GreetParams;
      return `Hello ${typedParams.name}, you are ${typedParams.age} years old`;
    });
    await server.connect(transport);

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    });

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'greet',
      params: {
        name: 'John',
        // Missing age parameter
      },
    });

    expect(transport.messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      error: {
        code: -32602,
        message: 'Invalid key: Expected "age" but received undefined',
      },
    });
  });

  it('should handle error responses with null id', async () => {
    await server.connect(transport.transport);

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    });

    expect(transport.messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 0,
      error: {
        code: -32600,
        message: 'Initialize must be a request',
      },
    });
  });

  it('should handle protocol version mismatch', async () => {
    await server.connect(transport.transport);

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '0.1.0',
        capabilities: {},
      },
    });

    expect(transport.messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      error: {
        code: -32600,
        message: `Protocol version mismatch. Server: ${LATEST_PROTOCOL_VERSION}, Client: 0.1.0`,
      },
    });
  });

  it('should handle logging level setting when supported', async () => {
    server = new Server({
      name: 'test-server',
      version: '1.0.0',
      capabilities: {
        logging: {},
      },
    });
    await server.connect(transport.transport);

    // Initialize first
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    });

    // Set logging level
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'logging/setLevel',
      params: {
        level: 'info',
      },
    });

    expect(transport.messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      result: {},
    });

    // Send a log message
    await server.sendLogMessage('info', 'Test message', 'test-logger');

    expect(transport.messages[2]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/message',
      params: {
        level: 'info',
        logger: 'test-logger',
        data: 'Test message',
      },
    });
  });

  it('should reject logging when not supported', async () => {
    await server.connect(transport.transport);

    // Initialize first
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    });

    // Try to set logging level
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'logging/setLevel',
      params: {
        level: 'info',
      },
    });

    expect(transport.messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      error: {
        code: -32601,
        message: 'Logging not supported',
      },
    });
  });

  it('should respect logging level priority', async () => {
    server = new Server({
      name: 'test-server',
      version: '1.0.0',
      capabilities: {
        logging: {},
      },
    });
    await server.connect(transport.transport);

    // Initialize first
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    });

    // Set logging level to warning
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'logging/setLevel',
      params: {
        level: 'warning',
      },
    });

    // Send messages at different levels
    await server.sendLogMessage('info', 'Info message'); // Should not be sent
    await server.sendLogMessage('warning', 'Warning message'); // Should be sent
    await server.sendLogMessage('error', 'Error message'); // Should be sent

    // Only warning and error messages should be sent
    expect(transport.messages.slice(2)).toMatchObject([
      {
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/message',
        params: {
          level: 'warning',
          data: 'Warning message',
        },
      },
      {
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/message',
        params: {
          level: 'error',
          data: 'Error message',
        },
      },
    ]);
  });

  it('should handle resource operations', async () => {
    server = new Server({
      name: 'test-server',
      version: '1.0.0',
      capabilities: {
        resources: {
          listChanged: true,
        },
      },
    });
    await server.connect(transport.transport);

    // Initialize first
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    });

    // Register a test resource
    const resource: ServerResource = {
      uri: 'test-resource',
      mimeType: 'text/plain',
      content: { key: 'value' }
    };
    server.resource(resource, resource.content);

    // Test listing resources
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'resources/list',
      params: {},
    });

    const messages = transport.getMessages();
    expect(messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      result: {
        resources: [resource],
      },
    });

    // Test reading a resource
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      method: 'resources/read',
      params: {
        uri: 'test-resource',
      },
    });

    expect(messages[2]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      result: {
        content: resource.content,
      },
    });

    // Test subscribing to a resource
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 4,
      method: 'resources/subscribe',
      params: {
        uri: 'test-resource',
      },
    });

    expect(messages[3]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 4,
      result: {},
    });

    // Update the resource and verify notification
    const newContent = { key: 'new-value' };
    const updatedResource: ServerResource = {
      uri: 'test-resource',
      mimeType: 'text/plain',
      content: newContent
    };
    server.resource(updatedResource, newContent);

    expect(messages[4]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/resourceChanged',
      params: {
        uri: 'test-resource',
        content: newContent,
      },
    });

    // Test unsubscribing from a resource
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 5,
      method: 'resources/unsubscribe',
      params: {
        uri: 'test-resource',
      },
    });

    expect(messages[5]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 5,
      result: {},
    });
  });

  it('should handle resource errors', async () => {
    server = new Server({
      name: 'test-server',
      version: '1.0.0',
      capabilities: {
        resources: {
          listChanged: true,
        },
      },
    });
    await server.connect(transport.transport);

    // Initialize first
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    });

    // Test reading a non-existent resource
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'resources/read',
      params: {
        name: 'non-existent-resource',
      },
    });

    expect(transport.messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      error: {
        code: -32602,
        message: 'Resource not found: non-existent-resource',
      },
    });

    // Test subscribing to a non-existent resource
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      method: 'resources/subscribe',
      params: {
        name: 'non-existent-resource',
      },
    });

    expect(transport.messages[2]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      error: {
        code: -32602,
        message: 'Resource not found: non-existent-resource',
      },
    });

    // Test unsubscribing from a non-existent resource
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'test-tool',
      params: {},
    });

    // Verify handler was called
    expect(handler).toHaveBeenCalledWith({});
  });

  it('should handle disconnect', async () => {
    const server = new McpServer({
      name: 'test-server',
      version: '1.0.0',
    });

    const transport = new TestTransport();
    await server.connect(transport.transport);

    // Disconnect
    await server.disconnect();

    // Verify disconnect message was sent
    const messages = transport.getMessages();
    expect(messages[messages.length - 1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      method: 'disconnect',
    });
  });
});
