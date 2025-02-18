import { number, object, string } from 'valibot';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTransport } from './in-memory.js';
import type { JSONRPCMessage, Prompt } from './schema.js';
import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from './schema.js';
import {
  McpServer,
  Server,
  type Resource as ServerResource,
} from './server.js';
import type { McpTransport, MessageHandler } from './transport.js';

/**
 * Test interface for greeting parameters.
 */
interface GreetParams {
  /** Name parameter */
  name: string;
  /** Age parameter */
  age: number;
}

const _greetSchema = object({
  name: string(),
  age: number(),
});

/**
 * Test transport implementation for simulating message handling.
 * Wraps an InMemoryTransport and adds message tracking capabilities.
 */
class TestTransport implements McpTransport {
  /** Underlying transport instance */
  public transport: InMemoryTransport;
  /** Message queue for tracking sent messages */
  public messages: JSONRPCMessage[] = [];

  constructor() {
    this.transport = new InMemoryTransport();
  }

  /**
   * Simulates connecting to the transport.
   * @returns Promise that resolves when connected
   */
  async connect(): Promise<void> {
    await this.transport.connect();
  }

  /**
   * Simulates disconnecting from the transport.
   * @returns Promise that resolves when disconnected
   */
  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }

  /**
   * Checks if the transport is connected.
   * @returns true if connected, false otherwise
   */
  isConnected(): boolean {
    return this.transport.isConnected();
  }

  /**
   * Simulates sending a message through the transport.
   * Also tracks the message in the messages array.
   * @param message Message to send
   * @returns Promise that resolves when sent
   */
  async send(message: JSONRPCMessage): Promise<void> {
    await this.transport.send(message);
    this.messages.push(message);
  }

  /**
   * Registers a message handler.
   * @param handler Handler function to register
   */
  onMessage(handler: MessageHandler): void {
    this.transport.onMessage(handler);
  }

  /**
   * Unregisters a message handler.
   * @param handler Handler function to unregister
   */
  offMessage(handler: MessageHandler): void {
    this.transport.offMessage(handler);
  }

  /**
   * Registers an error handler.
   * @param handler Handler function to register
   */
  onError(handler: (error: Error) => void): void {
    this.transport.onError(handler);
  }

  /**
   * Unregisters an error handler.
   * @param handler Handler function to unregister
   */
  offError(handler: (error: Error) => void): void {
    this.transport.offError(handler);
  }

  /**
   * Gets all messages sent through this transport.
   * @returns Array of sent messages
   */
  getMessages(): JSONRPCMessage[] {
    return this.messages;
  }

  /**
   * Clears all sent messages.
   */
  clearMessages(): void {
    this.transport.clearMessages();
    this.messages = [];
  }

  /**
   * Simulates an incoming message from the other transport.
   * @param message Message to simulate
   * @returns Promise that resolves when processed
   */
  async simulateIncomingMessage(message: JSONRPCMessage): Promise<void> {
    await this.transport.simulateIncomingMessage(message);
  }

  /**
   * Closes the transport.
   * @returns Promise that resolves when closed
   */
  async close(): Promise<void> {
    await this.transport.close();
  }
}

/**
 * Test suite for the Server class.
 * Tests server initialization, message handling, and various protocol features.
 */
describe('Server', () => {
  let server: Server;
  let transport: TestTransport;

  beforeEach(async () => {
    server = new Server({
      name: 'test-server',
      version: '1.0.0',
    });
    transport = new TestTransport();
    await transport.connect();
    await server.connect(transport);
  });

  /**
   * Tests server initialization and basic message handling.
   */
  describe('initialization', () => {
    /**
     * Tests that the server handles initialization correctly.
     * Verifies protocol version negotiation and capability exchange.
     */
    it('should handle initialization correctly', async () => {
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
        method: 'prompts/list',
        params: {},
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

      const messagesAfter = transport.getMessages();

      // Verify get prompt response
      expect(messagesAfter[2]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: 3,
        result: {
          description: 'A test prompt',
          messages: expect.any(Array),
        },
      });

      // Verify execute prompt response
      expect(messagesAfter[3]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: 4,
        result: {
          messages: expect.any(Array),
        },
      });

      // Verify non-existent prompt error
      expect(messagesAfter[4]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: 5,
        error: {
          code: -32602,
          message: 'Prompt not found: non-existent-prompt',
        },
      });

      // Verify missing argument error for get
      expect(messagesAfter[5]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: 6,
        error: {
          code: -32602,
          message: 'Missing required argument: arg1',
        },
      });

      // Verify missing argument error for execute
      expect(messagesAfter[6]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: 7,
        error: {
          code: -32602,
          message: 'Missing required argument: arg1',
        },
      });
    });

    /**
     * Tests that the server rejects initialization with an incompatible protocol version.
     */
    it('should reject incompatible protocol version', async () => {
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
  });

  /**
   * Tests prompt-related functionality.
   */
  describe('prompts', () => {
    /**
     * Tests registering and listing prompts.
     */
    it('should handle prompts correctly', async () => {
      const testPrompt: Prompt = {
        name: 'test-prompt',
        description: 'A test prompt',
        arguments: [
          {
            name: 'arg1',
            description: 'First argument',
          },
        ],
      };

      server.prompt(testPrompt);

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 2,
        method: 'prompts/list',
        params: {},
      });

      const messages = transport.getMessages();
      expect(messages[0]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: 2,
        result: {
          prompts: [testPrompt],
        },
      });
    });

    /**
     * Tests prompt execution with arguments.
     */
    it('should execute prompts with arguments', async () => {
      const testPrompt: Prompt = {
        name: 'test-prompt',
        arguments: [
          {
            name: 'arg1',
            description: 'First argument',
          },
        ],
      };

      server.prompt(testPrompt, async (args) => {
        return [
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `Using arg1: ${args?.arg1}`,
            },
          },
        ];
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 3,
        method: 'prompts/execute',
        params: {
          name: 'test-prompt',
          arguments: {
            arg1: 'test value',
          },
        },
      });

      const messages = transport.getMessages();
      expect(messages[0]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: 3,
        result: {
          messages: [
            {
              role: 'assistant',
              content: {
                type: 'text',
                text: 'Using arg1: test value',
              },
            },
          ],
        },
      });
    });
  });

  /**
   * Tests tool-related functionality.
   */
  describe('tools', () => {
    /**
     * Tests registering and executing tools.
     */
    it('should handle tools correctly', async () => {
      const schema = object({
        name: string(),
        age: number(),
      });

      await server.tool('greet', schema, (params: unknown) => {
        const typedParams = params as GreetParams;
        return Promise.resolve(
          `Hello, ${typedParams.name}! You are ${typedParams.age} years old.`
        );
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 4,
        method: 'tools/execute',
        params: {
          name: 'greet',
          params: {
            name: 'Alice',
            age: 25,
          },
        },
      });

      const messages = transport.getMessages();
      expect(messages[0]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: 4,
        result: 'Hello, Alice! You are 25 years old.',
      });
    });

    /**
     * Tests tool parameter validation.
     */
    it('should validate tool parameters', async () => {
      const schema = object({
        name: string(),
        age: number(),
      });

      await server.tool('greet', schema, (params: unknown) => {
        const typedParams = params as GreetParams;
        return Promise.resolve(
          `Hello, ${typedParams.name}! You are ${typedParams.age} years old.`
        );
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 5,
        method: 'tools/execute',
        params: {
          name: 'greet',
          params: {
            name: 'Alice',
            age: 'twenty-five', // Invalid type
          },
        },
      });

      const messages = transport.getMessages();
      expect(messages[0]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: 5,
        error: {
          code: -32602,
          message: expect.stringContaining('Invalid params'),
        },
      });
    });
  });

  /**
   * Tests unknown tool handling.
   */
  it('should handle unknown tools', async () => {
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'unknown-tool',
      params: {},
    });

    const messages = transport.getMessages();
    expect(messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      error: {
        code: -32601,
        message: 'Method not found',
      },
    });
  });

  /**
   * Tests invalid parameter rejection.
   */
  it('should reject invalid parameters', async () => {
    const schema = object({
      name: string(),
      age: number(),
    });

    await server.tool('greet', schema, (params: unknown) => {
      const typedParams = params as GreetParams;
      return Promise.resolve(
        `Hello, ${typedParams.name}! You are ${typedParams.age} years old.`
      );
    });

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
        age: 'not-a-number',
      },
    });

    const messages = transport.getMessages();
    expect(messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      error: {
        code: -32602,
        message: expect.any(String),
      },
    });
  });

  /**
   * Tests error responses with null id.
   */
  it('should handle error responses with null id', async () => {
    const errorHandler = vi.fn();
    transport.onError(errorHandler);

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      method: 'invalid',
      params: {},
    });

    expect(errorHandler).toHaveBeenCalled();
  });

  /**
   * Tests protocol version mismatch handling.
   */
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

  /**
   * Tests logging level setting when supported.
   */
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

  /**
   * Tests logging rejection when not supported.
   */
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

  /**
   * Tests logging level priority.
   */
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

  /**
   * Tests resource operations.
   */
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
      content: { key: 'value' },
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
      content: newContent,
    };
    server.resource(updatedResource, updatedResource.content);

    expect(messages[4]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/resources/list_changed',
    });

    expect(messages[5]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/resources/updated',
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

    expect(messages[6]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 5,
      result: {},
    });
  });

  /**
   * Tests resource errors.
   */
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
      id: 3,
      method: 'resources/unsubscribe',
      params: {
        uri: 'test://non-existent',
      },
    });

    expect(transport.getMessages()[2]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      error: {
        code: -32602,
        message: 'Resource not found: test://non-existent',
      },
    });
  });

  /**
   * Tests disconnect handling.
   */
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
    expect(messages.at(-1)).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      method: 'disconnect',
    });
  });

  /**
   * Tests message handler error handling.
   */
  it('should handle message handler errors gracefully', async () => {
    const messageHandler = vi.fn().mockImplementation(() => {
      throw new Error('Handler error');
    });
    transport.onMessage(messageHandler);

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      method: 'test',
      params: {},
    });

    expect(messageHandler).toHaveBeenCalled();
  });

  /**
   * Tests error handler error handling.
   */
  it('should handle error handler errors gracefully', async () => {
    const errorHandler = vi.fn().mockImplementation(() => {
      throw new Error('Handler error');
    });
    transport.onError(errorHandler);

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      method: 'test',
      params: {},
    });

    expect(errorHandler).toHaveBeenCalled();
  });

  /**
   * Tests message handler removal.
   */
  it('should handle message handler removal', async () => {
    const messageHandler = vi.fn();
    transport.onMessage(messageHandler);
    transport.offMessage(messageHandler);

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      method: 'test',
      params: {},
    });

    expect(messageHandler).not.toHaveBeenCalled();
  });
});
