import { Authentication } from './auth.js';
import { McpClient } from './client.js';
import { InMemoryTransport } from './in-memory.js';
import { McpServer } from './server.js';
import { describe, expect, it } from 'vitest';

describe('Model Context Protocol', () => {
  it('should handle basic request/response', async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    const server = new McpServer(serverTransport, {
      name: 'test-server',
      version: '1.0.0',
    });

    const client = new McpClient(clientTransport, {
      name: 'test-client',
      version: '1.0.0',
    });

    // Add a method to the server
    server.addMethod('greet', (params) => {
      const { name } = params as { name: string };
      return `Hello, ${name}!`;
    });

    // Connect both sides
    await server.connect();
    await client.connect();

    // Make a request
    const response = await client.request('greet', { name: 'Alice' });
    expect(response).toBe('Hello, Alice!');

    // Cleanup
    await client.disconnect();
    await server.disconnect();
  });

  it('should handle authentication', async () => {
    const auth = new Authentication({
      secretKey: 'test-secret',
      issuer: 'test-server',
      audience: 'test-client',
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    const server = new McpServer(serverTransport, {
      name: 'test-server',
      version: '1.0.0',
      auth,
    });

    const client = new McpClient(clientTransport, {
      name: 'test-client',
      version: '1.0.0',
      auth,
    });

    // Add a protected method to the server
    server.addMethod(
      'sensitiveOperation',
      async () => 'secret data',
      ['admin'] // Requires admin role
    );

    // Connect both sides
    await server.connect();
    await client.connect();

    // This should fail as the client doesn't have admin role
    await expect(client.request('sensitiveOperation')).rejects.toThrow(
      'Insufficient permissions'
    );

    // Cleanup
    await client.disconnect();
    await server.disconnect();
  });

  it('should handle notifications', async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    const server = new McpServer(serverTransport, {
      name: 'test-server',
      version: '1.0.0',
    });

    const client = new McpClient(clientTransport, {
      name: 'test-client',
      version: '1.0.0',
    });

    // Connect both sides
    await server.connect();
    await client.connect();

    // Send a notification
    await client.notify('log', { level: 'info', message: 'test' });

    // No error means success
    await client.disconnect();
    await server.disconnect();
  });
});
