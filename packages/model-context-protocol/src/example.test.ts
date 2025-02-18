import { describe, expect, it } from 'vitest';
import { Auth } from './auth';
import { McpClient } from './client';
import { InMemoryTransport } from './in-memory';
import { McpServer } from './server';

describe('Model Context Protocol', () => {
  it('should handle basic request/response', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createPair();

    const server = new McpServer({
      name: 'test-server',
      version: '1.0.0',
    });

    const client = new McpClient(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      clientTransport
    );

    // Register a method on the server
    server.registerMethod('greet', (params) => {
      const { name } = params as { name: string };
      return `Hello, ${name}!`;
    });

    // Connect both sides
    await server.connect(serverTransport);
    await client.connect();

    // Make a request
    const response = await client.request('greet', { name: 'Alice' });
    expect(response).toBe('Hello, Alice!');

    // Cleanup
    await client.disconnect();
    await serverTransport.close();
  });

  it('should handle authentication', async () => {
    const _auth = new Auth({
      secret: 'test-secret',
      issuer: 'test-server',
      audience: 'test-client',
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createPair();

    const server = new McpServer({
      name: 'test-server',
      version: '1.0.0',
    });

    const client = new McpClient(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      clientTransport
    );

    // Register a protected method on the server
    server.registerMethod(
      'sensitiveOperation',
      async () => 'secret data',
      ['admin'] // Requires admin role
    );

    // Connect both sides
    await server.connect(serverTransport);
    await client.connect();

    try {
      // This should fail as the client doesn't have admin role
      await expect(client.request('sensitiveOperation')).rejects.toThrow(
        'Authentication token required'
      );
    } finally {
      // Cleanup
      await client.disconnect();
      await serverTransport.close();
    }
  });

  it('should handle notifications', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createPair();

    const server = new McpServer({
      name: 'test-server',
      version: '1.0.0',
    });

    const client = new McpClient(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      clientTransport
    );

    // Connect both sides
    await server.connect(serverTransport);
    await client.connect();

    try {
      // Send a notification
      await client.notify('log', { level: 'info', message: 'test' });

      // No error means success
    } finally {
      await client.disconnect();
      await serverTransport.close();
    }
  });
});
