import { describe, it, expect, vi } from 'vitest';
import { Server } from './server.js';
import type { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse, JSONRPCError } from './schema.js';
import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from './schema.js';
import { object, string, number } from 'valibot';
import type { McpTransport } from './transport.js';

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
    return Promise.resolve();
  }

  async simulateMessage(message: JSONRPCMessage): Promise<void> {
    if (this.handler) {
      await this.handler(message);
    }
  }
}

describe('McpServer', () => {
  let server: Server;
  let transport: TestTransport;

  beforeEach(() => {
    server = new Server({
      name: 'test-server',
      version: '1.0.0',
    });
    transport = new TestTransport();
  });

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
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {},
      },
    });
  });

  it('should register and expose tools', async () => {
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
        message: 'Method not found',
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
