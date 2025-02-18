import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTransport } from './in-memory';
import {
  JSONRPC_VERSION,
  LATEST_PROTOCOL_VERSION,
  type Resource,
} from './schema';
import { McpServer } from './server';

describe('Resource Management', () => {
  let server: McpServer;
  let transport: InMemoryTransport;

  beforeEach(async () => {
    transport = new InMemoryTransport();
    await transport.connect();
    server = new McpServer({
      name: 'test-server',
      version: '1.0.0',
    });
    await server.connect(transport);

    // Initialize server
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {
          resources: {
            listChanged: true,
            subscribe: true,
          },
        },
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      },
    });

    // Clear any initialization messages
    transport.clearMessages();
  });

  it('should list resources', async () => {
    const resource: Resource = {
      uri: 'test://resource1',
      name: 'Test Resource',
      mimeType: 'text/plain',
    };
    server.resource(resource);

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
  });

  it('should list resource templates', async () => {
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'resources/register',
      params: {
        name: 'Test Template',
        uriTemplate: 'test://{name}',
        mimeType: 'text/plain',
      },
    });

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      method: 'resources/templates/list',
      params: {},
    });

    const messages = transport.getMessages();
    expect(messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      result: {
        resourceTemplates: [
          {
            name: 'Test Template',
            uriTemplate: 'test://{name}',
            mimeType: 'text/plain',
          },
        ],
      },
    });
  });

  it('should read a resource', async () => {
    const resource: Resource = {
      uri: 'test://resource1',
      name: 'Test Resource',
      mimeType: 'text/plain',
    };
    server.resource(resource);

    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'resources/read',
      params: { uri: resource.uri },
    });

    const messages = transport.getMessages();
    expect(messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      result: {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: 'test content',
          },
        ],
      },
    });
  });

  it('should handle resource subscriptions', async () => {
    const resource: Resource = {
      uri: 'test://resource1',
      name: 'Test Resource',
      mimeType: 'text/plain',
    };
    server.resource(resource);

    // Subscribe to resource
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'resources/subscribe',
      params: { uri: resource.uri },
    });

    const messages = transport.getMessages();
    expect(messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      result: {},
    });

    // Update resource
    const updatedResource: Resource = {
      ...resource,
      description: 'Updated resource',
    };
    server.resource(updatedResource);

    expect(messages[2]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/resources/list_changed',
    });

    expect(messages[3]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/resources/updated',
      params: {
        uri: resource.uri,
      },
    });
  });

  it('should handle resource list change notifications', () => {
    const resource: Resource = {
      uri: 'test://resource1',
      name: 'Test Resource',
      mimeType: 'text/plain',
    };

    server.resource(resource);
    const messages = transport.getMessages();
    expect(messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/resources/list_changed',
    });
  });

  it('should handle errors for non-existent resources', async () => {
    // Try to read non-existent resource
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'resources/read',
      params: { uri: 'test://non-existent' },
    });

    const messages = transport.getMessages();
    expect(messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      error: {
        code: -32602,
        message: 'Resource not found: test://non-existent',
      },
    });

    // Try to subscribe to non-existent resource
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      method: 'resources/subscribe',
      params: { uri: 'test://non-existent' },
    });

    expect(messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      error: {
        code: -32602,
        message: 'Resource not found: test://non-existent',
      },
    });
  });
});
