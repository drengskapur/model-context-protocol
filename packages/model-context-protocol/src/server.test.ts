import { EventEmitter } from 'eventemitter3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Auth } from './auth';
import type { JSONRPCMessage } from './jsonrpc';
import {
  JSONRPC_VERSION,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from './schema';
import type { Implementation, ServerCapabilities, Tool } from './schema';
import { McpServer } from './server';
import type {
  McpTransport,
  MessageHandler,
  TransportEventMap,
} from './transport';

const SERVER_SUPPORT_ERROR_PATTERN = /server does not support/i;
const PROTOCOL_VERSION_ERROR_PATTERN = /unsupported protocol version/i;

/**
 * Test transport implementation for simulating message handling.
 */
class TestTransport
  extends EventEmitter<TransportEventMap>
  implements McpTransport
{
  private _connected = false;
  private _handler: MessageHandler | undefined;

  get connected(): boolean {
    return this._connected;
  }

  connect(): Promise<void> {
    this._connected = true;
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this._connected = false;
    return Promise.resolve();
  }

  send(_message: JSONRPCMessage): Promise<void> {
    if (!this._connected) {
      throw new Error('Transport not connected');
    }
    return Promise.resolve();
  }

  onMessage(handler: MessageHandler): void {
    this._handler = handler;
  }

  async simulateIncomingMessage(message: JSONRPCMessage): Promise<void> {
    if (!this._connected) {
      throw new Error('Transport not connected');
    }

    if (!this._handler) {
      throw new Error('No message handler registered');
    }

    await this._handler(message);
  }
}

describe('McpServer', () => {
  let server: McpServer;
  let transport: TestTransport;

  beforeEach(async () => {
    const implementation: Implementation = {
      name: 'test-server',
      version: '1.0.0',
    };

    const capabilities: ServerCapabilities = {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      implementations: [
        {
          name: 'test-server',
          version: '1.0.0',
        },
      ],
      tools: [],
    };

    const auth: Auth = {
      roles: ['user'],
    };

    transport = new TestTransport();
    server = new McpServer(implementation, capabilities, auth);

    await server.connect(transport);
  });

  afterEach(async () => {
    await transport.disconnect();
  });

  /**
   * Tests initialization and protocol version negotiation.
   */
  describe('Initialization', () => {
    /**
     * Verifies protocol version negotiation and capability exchange.
     */
    it('should handle initialization correctly', async () => {
      const testPrompt = {
        name: 'test-prompt',
        description: 'A test prompt',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
          required: ['name', 'age'],
        },
      };

      server.registerMethod('prompts/get', (_params: unknown) => testPrompt);
      server.registerMethod('prompts/list', () => ({
        prompts: [testPrompt],
      }));

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'initialize',
        params: {
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      });

      expect(server.initialized).toBe(true);
    });
  });

  /**
   * Tests tool registration and execution.
   */
  describe('Tools', () => {
    /**
     * Tests tool registration and listing.
     */
    it('should handle tool registration and listing', async () => {
      const testTool: Tool = {
        name: 'test-tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
          required: ['name', 'age'],
        },
      };

      server.registerMethod('tools/list', () => ({ tools: [testTool] }));
      server.registerMethod('tools/call', (_params: unknown) => ({
        success: true,
      }));

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'tools/list',
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '2',
        method: 'tools/call',
        params: {
          name: 'test-tool',
          arguments: {
            name: 'John',
            age: 30,
          },
        },
      });
    });

    it('should register zero-argument tool', async () => {
      server.registerMethod('tools/register', (_params: unknown) => ({
        success: true,
      }));

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'tools/register',
        params: {
          name: 'test-tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
          },
        },
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '2',
        method: 'tools/list',
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '3',
        method: 'tools/call',
        params: {
          name: 'test-tool',
        },
      });
    });

    it('should register tool with args schema', async () => {
      server.registerMethod('tools/register', (_params: unknown) => ({
        success: true,
      }));

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'tools/register',
        params: {
          name: 'test-tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'number' },
            },
          },
        },
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '2',
        method: 'tools/list',
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '3',
        method: 'tools/call',
        params: {
          name: 'test-tool',
          arguments: {
            name: 'John',
            value: 30,
          },
        },
      });
    });

    it('should validate tool args', async () => {
      server.registerMethod('tools/register', (_params: unknown) => ({
        success: true,
      }));

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'tools/register',
        params: {
          name: 'test-tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'number' },
            },
          },
        },
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '2',
        method: 'tools/list',
      });

      await expect(
        transport.simulateIncomingMessage({
          jsonrpc: JSONRPC_VERSION,
          id: '3',
          method: 'tools/call',
          params: {
            name: 'test-tool',
            arguments: {
              name: 'John',
              value: 'not a number',
            },
          },
        })
      ).rejects.toThrow(/Invalid arguments/);
    });

    it('should prevent duplicate tool registration', async () => {
      server.registerMethod('tools/register', (_params: unknown) => ({
        success: true,
      }));

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'tools/register',
        params: {
          name: 'test-tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
          },
        },
      });

      await expect(
        transport.simulateIncomingMessage({
          jsonrpc: JSONRPC_VERSION,
          id: '2',
          method: 'tools/register',
          params: {
            name: 'test-tool',
            description: 'A test tool',
            parameters: {
              type: 'object',
            },
          },
        })
      ).rejects.toThrow(/already registered/);
    });
  });

  /**
   * Tests logging level setting when supported.
   */
  it('should handle logging level setting when supported', async () => {
    server.registerMethod('logging/setLevel', (_params: unknown) => {
      return { success: true };
    });

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      method: 'logging/setLevel',
      params: {
        level: 'info',
      },
    });
  });

  /**
   * Tests resource operations.
   */
  it('should handle resource operations', async () => {
    const resource = {
      uri: 'test-resource',
      mimeType: 'text/plain',
      content: 'Hello, World!',
    };

    server.registerResource(resource);

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      method: 'resources/list',
    });

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '2',
      method: 'resources/read',
      params: {
        uri: 'test-resource',
      },
    });
  });

  describe('Resource Registration and Handling', () => {
    it('should register resource with uri and readCallback', async () => {
      server.registerMethod('resources/register', (_params: unknown) => ({
        success: true,
      }));

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'resources/register',
        params: {
          name: 'test-resource',
          uri: 'test://resource',
        },
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '2',
        method: 'resources/list',
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '3',
        method: 'resources/read',
        params: {
          uri: 'test://resource',
        },
      });
    });

    it('should register resource template with listCallback', async () => {
      server.registerMethod('resources/register', (_params: unknown) => ({
        success: true,
      }));

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'resources/register',
        params: {
          name: 'test-resource',
          uriTemplate: 'test://resource/{id}',
          listCallback: (_params: unknown) => ({
            resources: [
              {
                name: 'Resource 1',
                uri: 'test://resource/1',
              },
              {
                name: 'Resource 2',
                uri: 'test://resource/2',
              },
            ],
          }),
        },
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '2',
        method: 'resources/list',
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '3',
        method: 'resources/read',
        params: {
          uri: 'test://resource/1',
        },
      });
    });

    it('should support completion of resource template parameters', async () => {
      server.registerMethod('resources/register', (_params: unknown) => ({
        success: true,
      }));

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'resources/register',
        params: {
          name: 'test-resource',
          uriTemplate: 'test://resource/{category}',
          completeCallback: (_params: unknown) => ({
            values: ['books', 'movies', 'music'],
          }),
        },
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '2',
        method: 'completion/complete',
        params: {
          ref: {
            type: 'ref/resource',
            uri: 'test://resource/{category}',
          },
          argument: {
            name: 'category',
            value: '',
          },
        },
      });
    });
  });

  /**
   * Tests authentication handling.
   */
  it('should handle authentication', async () => {
    const implementation: Implementation = {
      name: 'test-server',
      version: '1.0.0',
    };

    const capabilities: ServerCapabilities = {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      implementations: [implementation],
      tools: [],
    };

    const auth: Auth = {
      roles: ['admin'],
    };

    server = new McpServer(implementation, capabilities, auth);

    server.registerMethod('sensitiveOperation', () => 'secret data', ['admin']);

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      method: 'sensitiveOperation',
    });
  });

  it('should handle test/async', async () => {
    server.registerMethod('test/async', () => {
      return { success: true };
    });

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: '1',
      method: 'test/async',
    });
  });

  describe('Prompt Registration and Handling', () => {
    it('should register prompt with args schema', async () => {
      server.registerMethod('prompts/register', (_params: unknown) => ({
        success: true,
      }));

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'prompts/register',
        params: {
          name: 'test-prompt',
          description: 'A test prompt',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '2',
        method: 'prompts/list',
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '3',
        method: 'prompts/get',
        params: {
          name: 'test-prompt',
        },
      });
    });

    it('should support completion of prompt arguments', async () => {
      server.registerMethod('prompts/register', (_params: unknown) => ({
        success: true,
      }));

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'prompts/register',
        params: {
          name: 'test-prompt',
          description: 'A test prompt',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
          completeCallback: (_params: unknown) => ({
            values: ['Alice', 'Bob', 'Charlie'],
          }),
        },
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '2',
        method: 'completion/complete',
        params: {
          ref: {
            type: 'ref/prompt',
            name: 'test-prompt',
          },
          argument: {
            name: 'name',
            value: '',
          },
        },
      });
    });

    it('should support filtered completion of prompt arguments', async () => {
      server.registerMethod('prompts/register', (_params: unknown) => ({
        success: true,
      }));

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'prompts/register',
        params: {
          name: 'test-prompt',
          description: 'A test prompt',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
          completeCallback: (_params: unknown, filter: string) => ({
            values: ['Alice', 'Bob', 'Charlie'].filter((value) =>
              value.startsWith(filter)
            ),
          }),
        },
      });

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '2',
        method: 'completion/complete',
        params: {
          ref: {
            type: 'ref/prompt',
            name: 'test-prompt',
          },
          argument: {
            name: 'name',
            value: 'A',
          },
        },
      });
    });
  });

  describe('Protocol Version Handling', () => {
    it('should accept latest protocol version', async () => {
      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0',
          },
        },
      });

      expect(server.initialized).toBe(true);
      expect(server.getProtocolVersion()).toBe(LATEST_PROTOCOL_VERSION);
    });

    it('should accept supported older protocol version', async () => {
      const OLD_VERSION = SUPPORTED_PROTOCOL_VERSIONS[1];

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'initialize',
        params: {
          protocolVersion: OLD_VERSION,
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0',
          },
        },
      });

      expect(server.initialized).toBe(true);
      expect(server.getProtocolVersion()).toBe(OLD_VERSION);
    });

    it('should reject unsupported protocol version', async () => {
      await expect(
        transport.simulateIncomingMessage({
          jsonrpc: JSONRPC_VERSION,
          id: '1',
          method: 'initialize',
          params: {
            protocolVersion: 'invalid-version',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0',
            },
          },
        })
      ).rejects.toThrow(PROTOCOL_VERSION_ERROR_PATTERN);
    });
  });

  describe('Capability Handling', () => {
    it('should respect client capabilities', async () => {
      const customCapabilities: ServerCapabilities = {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        implementations: [
          {
            name: 'test-server',
            version: '1.0.0',
          },
        ],
        tools: [],
        sampling: {},
      };

      const customServer = new McpServer(
        { name: 'test-server', version: '1.0.0' },
        customCapabilities,
        { roles: ['user'] }
      );

      await customServer.connect(transport);

      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {
            sampling: {},
          },
          clientInfo: {
            name: 'test-client',
            version: '1.0',
          },
        },
      });

      expect(customServer.getClientCapabilities()).toEqual({ sampling: {} });
    });

    it('should respect server notification capabilities', async () => {
      const customCapabilities: ServerCapabilities = {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        implementations: [
          {
            name: 'test-server',
            version: '1.0.0',
          },
        ],
        tools: [],
        logging: {},
      };

      const customServer = new McpServer(
        { name: 'test-server', version: '1.0.0' },
        customCapabilities,
        { roles: ['user'] }
      );

      await customServer.connect(transport);

      // This should work because logging is supported
      await expect(
        customServer.notify('logging/message', {
          level: 'info',
          message: 'Test log message',
        })
      ).resolves.not.toThrow();

      // This should throw because resource notifications are not supported
      await expect(
        customServer.notify('resource/updated', { uri: 'test://resource' })
      ).rejects.toThrow(SERVER_SUPPORT_ERROR_PATTERN);
    });
  });

  describe('Request Handling', () => {
    it('should handle request timeout', async () => {
      server.registerMethod('test/timeout', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { success: true };
      });

      await expect(
        transport.simulateIncomingMessage({
          jsonrpc: JSONRPC_VERSION,
          id: '1',
          method: 'test/timeout',
          params: {},
        })
      ).rejects.toMatchObject({
        code: 'REQUEST_TIMEOUT',
      });
    });

    it('should handle request cancellation', async () => {
      const abortController = new AbortController();

      server.registerMethod('test/cancel', async (_, { signal }) => {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, 1000);
          signal?.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(signal.reason);
          });
        });
        return { success: true };
      });

      const promise = transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: '1',
        method: 'test/cancel',
        params: {},
      });

      abortController.abort('Cancelled by test');

      await expect(promise).rejects.toBe('Cancelled by test');
    });
  });
});
