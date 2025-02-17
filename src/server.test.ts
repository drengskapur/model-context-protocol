import { number, object, string } from 'valibot';
import { beforeEach, describe, expect, it } from 'vitest';
import { McpServer } from './server.js';
import {
  type JSONRPCMessage,
  JSONRPC_VERSION,
  LATEST_PROTOCOL_VERSION,
  type McpTransport,
} from './types.js';

describe('McpServer', () => {
  let server: McpServer;
  let transport: TestTransport;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    transport = new TestTransport();
  });

  class TestTransport implements McpTransport {
    messages: JSONRPCMessage[] = [];
    handler: ((message: JSONRPCMessage) => Promise<void>) | null = null;

    async connect(): Promise<void> {
      return Promise.resolve();
    }

    async disconnect(): Promise<void> {
      return Promise.resolve();
    }

    async send(message: JSONRPCMessage): Promise<void> {
      this.messages.push(message);
      return Promise.resolve();
    }

    onMessage(handler: (message: JSONRPCMessage) => Promise<void>): void {
      this.handler = handler;
    }

    offMessage(): void {
      this.handler = null;
    }

    async close(): Promise<void> {
      await this.disconnect();
    }

    async simulateMessage(message: JSONRPCMessage): Promise<void> {
      if (this.handler) {
        await this.handler(message);
      }
    }
  }

  it('should handle initialization', async () => {
    await server.connect(transport);

    await transport.simulateMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    });

    expect(transport.messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: 'test',
          version: '1.0.0',
        },
        capabilities: {},
      },
    });
  });

  it('should register and expose tools', async () => {
    const server = new McpServer({
      name: 'test',
      version: '1.0.0',
    });

    const transport = new TestTransport();
    const schema = object({
      name: string(),
      age: number(),
    });

    server.tool('greet', schema, (params) => {
      return `Hello ${params.name}, you are ${params.age} years old`;
    });

    await server.connect(transport);

    await transport.simulateMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    });

    await transport.simulateMessage({
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

    await transport.simulateMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    });

    await transport.simulateMessage({
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
        message: 'Tool not found',
      },
    });
  });

  it('should reject invalid parameters', async () => {
    const schema = object({
      name: string(),
      age: number(),
    });

    server.tool(
      'greet',
      schema,
      async (params) => `Hello ${params.name}, you are ${params.age} years old`
    );
    await server.connect(transport);

    await transport.simulateMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    });

    await transport.simulateMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'greet',
      params: {
        name: 'John',
        age: 'invalid',
      },
    });

    expect(transport.messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      error: {
        code: -32602,
        message: 'Invalid params',
      },
    });
  });

  it('should handle error responses with null id', async () => {
    await server.connect(transport);

    await transport.simulateMessage({
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
        message: 'Invalid Request',
        data: 'Initialize must be a request',
      },
    });
  });

  it('should handle protocol version mismatch', async () => {
    await server.connect(transport);

    await transport.simulateMessage({
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
        message: 'Invalid Request',
        data: `Protocol version mismatch. Server: ${LATEST_PROTOCOL_VERSION}, Client: 0.1.0`,
      },
    });
  });
});
