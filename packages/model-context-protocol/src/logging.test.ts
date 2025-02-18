import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpClient } from './client.js';
import { InMemoryTransport } from './in-memory.js';
import type { LoggingLevel } from './schema.js';
import { McpServer } from './server.js';

describe('Logging', () => {
  let client: McpClient;
  let server: McpServer;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new McpClient({
      name: 'test-client',
      version: '1.0.0',
      capabilities: {
        logging: {},
      },
    });

    server = new McpServer({
      name: 'test-server',
      version: '1.0.0',
      capabilities: {
        logging: {},
      },
    });

    await server.connect(serverTransport);
    await clientTransport.connect();
    await client.connect(clientTransport);
  });

  it('should set logging level', async () => {
    const level: LoggingLevel = 'info';
    await client.setLoggingLevel(level);

    const messages = clientTransport.getMessages();
    expect(messages.at(-1)).toMatchObject({
      jsonrpc: '2.0',
      method: 'logging/setLevel',
      params: { level },
    });
  });

  it('should receive log messages', async () => {
    const messageHandler = vi.fn();
    client.onMessage(messageHandler);

    await client.setLoggingLevel('info');

    // Simulate server sending a log message
    await serverTransport.send({
      jsonrpc: '2.0',
      method: 'notifications/message',
      params: {
        level: 'info',
        logger: 'test',
        data: 'Test log message',
      },
    });

    expect(messageHandler).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      method: 'notifications/message',
      params: {
        level: 'info',
        logger: 'test',
        data: 'Test log message',
      },
    });
  });

  it('should reject logging if not supported', async () => {
    // Create new client/server without logging capability
    const newClient = new McpClient({
      name: 'test-client',
      version: '1.0.0',
    });

    const newServer = new McpServer({
      name: 'test-server',
      version: '1.0.0',
    });

    const [newClientTransport, newServerTransport] =
      InMemoryTransport.createLinkedPair();
    await newServer.connect(newServerTransport);
    await newClientTransport.connect();
    await newClient.connect(newClientTransport);

    await expect(newClient.setLoggingLevel('info')).rejects.toThrow(
      'Server does not support logging'
    );
  });
});
