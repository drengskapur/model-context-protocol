import { EventEmitter } from 'eventemitter3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Auth } from './auth';
import type { JSONRPCMessage } from './jsonrpc';
import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from './schema';
import type { Implementation, ServerCapabilities, Tool } from './schema';
import { McpServer } from './server';
import type {
  McpTransport,
  MessageHandler,
  TransportEventMap,
} from './transport';

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
});
