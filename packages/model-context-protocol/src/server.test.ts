/**
 * @file server.test.ts
 * @description Test suite for the Model Context Protocol server implementation.
 * Contains unit tests for server functionality and request handling.
 * 
 * @copyright 2025 Codeium
 * @license MIT
 */

import { EventEmitter } from 'eventemitter3';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { object, string, number } from 'valibot';
import { InMemoryTransport } from './in-memory';
import type {
  JSONRPCMessage,
  Prompt,
  Tool,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  Implementation,
  ServerCapabilities,
  Resource,
} from './schema';
import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from './schema';
import { McpServer } from './server';
import type {
  McpTransport,
  MessageHandler,
  TransportEventMap,
} from './transport';
import { McpClient } from './client';
import type { Auth } from './auth';

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
  public messages: (JSONRPCRequest | JSONRPCResponse)[] = [];
  public readonly events = new EventEmitter();

  constructor() {
    this.transport = new InMemoryTransport();
    
    // Forward all events from the underlying transport
    this.transport.events.on('message', (msg) => this.events.emit('message', [msg]));
    this.transport.events.on('error', (err) => this.events.emit('error', [err]));
    this.transport.events.on('connect', () => this.events.emit('connect', []));
    this.transport.events.on('disconnect', () => this.events.emit('disconnect', []));
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
  async send(message: JSONRPCRequest | JSONRPCResponse | JSONRPCNotification): Promise<void> {
    if ('id' in message) {
      await this.transport.send(message as JSONRPCRequest | JSONRPCResponse);
      this.messages.push(message as JSONRPCRequest | JSONRPCResponse);
    } else {
      await this.transport.send({
        ...message,
        id: '1',
      } as JSONRPCRequest);
    }
  }

  /**
   * Simulates receiving a message.
   * @param message Message to simulate
   * @returns Promise that resolves when processed
   */
  async simulateIncomingMessage(message: JSONRPCRequest | JSONRPCNotification): Promise<void> {
    await this.transport.simulateIncomingMessage(message);
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
  getMessages(): (JSONRPCRequest | JSONRPCResponse)[] {
    return this.messages;
  }

  /**
   * Clears all stored messages.
   */
  clearMessages(): void {
    this.messages = [];
  }

  /**
   * Closes the transport.
   */
  async close(): Promise<void> {
    await this.transport.close();
  }

  on<K extends keyof TransportEventMap>(
    event: K,
    handler: (...args: TransportEventMap[K]) => void
  ): void {
    this.events.on(event, handler);
  }

  off<K extends keyof TransportEventMap>(
    event: K,
    handler: (...args: TransportEventMap[K]) => void
  ): void {
    this.events.off(event, handler);
  }
}

/**
 * Test suite for the Server class.
 * Tests server initialization, message handling, and various protocol features.
 */
describe('Server', () => {
  let server: McpServer;
  let transport: TestTransport;

  beforeEach(async () => {
    const implementation: Implementation = {
      name: 'test-server',
      version: '1.0.0',
    };

    const capabilities: ServerCapabilities = {
      logging: {},
      resources: {
        listChanged: true,
      },
    };

    server = new McpServer(implementation, capabilities);
    transport = new TestTransport();
    await transport.connect();
    await server.connect(transport);
  });

  afterEach(async () => {
    await transport.disconnect();
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

      server.registerMethod('prompts/get', async (params: unknown) => testPrompt);
      server.registerMethod('prompts/list', async () => ({
        prompts: [testPrompt],
      }));

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
        },
      } satisfies JSONRPCRequest);

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '2',
        method: 'prompts/list',
        params: {},
      } satisfies JSONRPCRequest);

      const messages = transport.messages;

      // Verify initialization response
      expect(messages[0]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        result: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          serverInfo: {
            name: 'test-server',
            version: '1.0.0',
          },
          capabilities: {
            logging: {},
            resources: {
              listChanged: true,
            },
          },
        },
      });

      // Verify prompts list response
      expect(messages[1]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: '2',
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
      } satisfies JSONRPCRequest);

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
      } satisfies JSONRPCRequest);

      // Test getting a non-existent prompt
      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 5,
        method: 'prompts/get',
        params: {
          name: 'non-existent-prompt',
        },
      } satisfies JSONRPCRequest);

      // Test getting a prompt without required argument
      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 6,
        method: 'prompts/get',
        params: {
          name: 'test-prompt',
          // Missing required arg1
        },
      } satisfies JSONRPCRequest);

      // Test executing a prompt without required argument
      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 7,
        method: 'prompts/execute',
        params: {
          name: 'test-prompt',
          // Missing required arg1
        },
      } satisfies JSONRPCRequest);

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
            required: true,
          },
        ],
      };

      server.prompt(testPrompt);

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'prompts/list',
        params: {},
      } satisfies JSONRPCRequest);

      expect(transport.messages[0]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
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

      server.prompt(testPrompt);
      server.registerMethod(`prompts/execute/${testPrompt.name}`, async (params: unknown) => {
        const { arguments: args } = params as { arguments?: Record<string, string> };
        return {
          messages: [
            {
              role: 'assistant',
              content: {
                type: 'text',
                text: `Using arg1: ${args?.arg1}`,
              },
            },
          ],
        };
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'prompts/execute',
        params: {
          name: 'test-prompt',
          arguments: {
            arg1: 'test value',
          },
        },
      } satisfies JSONRPCRequest);

      expect(transport.messages[0]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
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

    it('should handle prompts with arguments', async () => {
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
        id: '1',
        method: 'prompts/get',
        params: {
          name: 'test-prompt',
          arguments: {
            arg1: 'test-value',
          },
        },
      } satisfies JSONRPCRequest);

      expect(transport.messages[0]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        result: {
          description: 'A test prompt',
          messages: expect.any(Array),
        },
      });
    });

    it('should handle missing required arguments', async () => {
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
        id: '1',
        method: 'prompts/get',
        params: {
          name: 'test-prompt',
        },
      } satisfies JSONRPCRequest);

      expect(transport.messages[0]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        error: {
          code: -32602,
          message: 'Missing required argument: arg1',
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
      const testTool: Tool = {
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            arg1: { type: 'string' },
          },
          required: ['arg1'],
        },
      };

      server.registerMethod('tools/list', async () => ({ tools: [testTool] }));
      server.registerMethod('tools/call', async (params: unknown) => ({ success: true }));

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'tools/list',
        params: {},
      } satisfies JSONRPCRequest);

      const messages = transport.messages;

      expect(messages[0]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        result: {
          tools: [testTool],
        },
      });
    });

    /**
     * Tests tool parameter validation.
     */
    it('should handle tool parameter validation', async () => {
      const schema = object({
        name: string(),
        age: number(),
      });

      server.tool('greet', schema, async (params: unknown) => {
        const typedParams = params as GreetParams;
        return `Hello, ${typedParams.name}! You are ${typedParams.age} years old.`;
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'tools/execute',
        params: {
          name: 'greet',
          params: {
            name: 'Alice',
            age: 'twenty-five', // Invalid type
          },
        },
      } satisfies JSONRPCRequest);

      const messages = transport.messages;
      expect(messages[0]).toMatchObject({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
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
    server.registerMethod('logging/setLevel', async (params: unknown) => {
      return { success: true };
    });

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      method: 'logging/setLevel',
      params: { level: 'info' },
    } satisfies JSONRPCRequest);

    const messages = transport.messages;
    expect(messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      result: { success: true },
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
    const implementation: Implementation = {
      name: 'test-server',
      version: '1.0.0',
    };

    const capabilities: ServerCapabilities = {
      logging: {},
    };

    server = new McpServer(implementation, capabilities);
    await server.connect(transport.transport);

    // Initialize first
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    } satisfies JSONRPCRequest);

    // Set logging level to warning
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '2',
      method: 'logging/setLevel',
      params: {
        level: 'warning',
      },
    } satisfies JSONRPCRequest);

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
    const resource: Resource = {
      uri: 'test-resource',
      mimeType: 'text/plain',
      name: 'Test Resource',
    };

    server.resource(resource);

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      method: 'resources/list',
      params: {},
    } satisfies JSONRPCRequest);

    expect(transport.messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      result: {
        resources: [resource],
      },
    });
  });

  /**
   * Tests resource errors.
   */
  it('should handle resource errors', async () => {
    const implementation: Implementation = {
      name: 'test-server',
      version: '1.0.0',
    };

    const capabilities: ServerCapabilities = {
      resources: {
        listChanged: true,
      },
    };

    server = new McpServer(implementation, capabilities);
    await server.connect(transport.transport);

    // Initialize first
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      method: 'resources/read',
      params: {
        name: 'non-existent-resource',
      },
    } satisfies JSONRPCRequest);

    expect(transport.messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      error: {
        code: -32602,
        message: 'Resource not found: non-existent-resource',
      },
    });

    // Test subscribing to a non-existent resource
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '2',
      method: 'resources/subscribe',
      params: {
        name: 'non-existent-resource',
      },
    } satisfies JSONRPCRequest);

    expect(transport.messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: '2',
      error: {
        code: -32602,
        message: 'Resource not found: non-existent-resource',
      },
    });

    // Test unsubscribing from a non-existent resource
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '3',
      method: 'resources/unsubscribe',
      params: {
        uri: 'test://non-existent',
      },
    } satisfies JSONRPCRequest);

    expect(transport.messages[2]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: '3',
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
    const implementation: Implementation = {
      name: 'test-server',
      version: '1.0.0',
    };

    server = new McpServer(implementation);
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
      id: '1',
      method: 'test',
      params: {},
    } satisfies JSONRPCRequest);

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
      id: '1',
      method: 'test',
      params: {},
    } satisfies JSONRPCRequest);

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
      id: '1',
      method: 'test',
      params: {},
    } satisfies JSONRPCRequest);

    expect(messageHandler).not.toHaveBeenCalled();
  });

  it('should handle basic request/response', async () => {
    server.registerMethod('greet', async (params: unknown) => {
      const { name } = params as { name: string };
      return `Hello, ${name}!`;
    });

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      method: 'greet',
      params: { name: 'Alice' },
    } satisfies JSONRPCRequest);

    expect(transport.messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      result: 'Hello, Alice!',
    });
  });

  it('should handle notifications', async () => {
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      method: 'notifications/message',
      params: {
        level: 'info',
        data: 'test',
      },
    } satisfies JSONRPCRequest);

    // No error means success
  });

  it('should handle errors', async () => {
    const errorHandler = vi.fn();
    transport.onError(errorHandler);

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      method: 'invalid',
      params: {},
    } satisfies JSONRPCRequest);

    expect(transport.messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      error: {
        code: -32601,
        message: 'Method not found: invalid',
      },
    });
  });

  it('should handle authentication', async () => {
    const auth = {
      validateToken: vi.fn().mockResolvedValue({ roles: ['admin'] }),
      generateToken: vi.fn(),
      verify: vi.fn(),
      secretKey: new TextEncoder().encode('test-secret'),
      getOptions: () => ({
        secret: 'test-secret',
        tokenExpiration: 3600,
        issuer: 'test-server',
        audience: 'test-client',
      }),
    } as unknown as Auth;

    const implementation: Implementation = {
      name: 'test-server',
      version: '1.0.0',
    };

    const capabilities: ServerCapabilities = {
      logging: {},
      resources: {
        listChanged: true,
      },
    };

    server = new McpServer(implementation, capabilities, auth);

    server.registerMethod(
      'sensitiveOperation',
      async () => 'secret data',
      ['admin']
    );

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      method: 'sensitiveOperation',
      params: {},
    } satisfies JSONRPCRequest);

    expect(transport.messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      error: {
        code: -32000,
        message: 'Authentication token required',
      },
    });
  });
});
