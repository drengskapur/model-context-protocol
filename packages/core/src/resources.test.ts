import { describe, it, expect, beforeEach } from 'vitest';
import { Server } from './server';
import type { Resource, ResourceTemplate } from './server';
import { InMemoryTransport } from './in-memory';
import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from './schema';

describe('Resource Management', () => {
  let server: Server;
  let transport: InMemoryTransport;

  beforeEach(async () => {
    transport = new InMemoryTransport();
    server = new Server({
      name: 'test-server',
      version: '1.0.0',
      capabilities: {
        resources: {
          listChanged: true,
        },
      },
    });
    await server.connect(transport);

    // Initialize server
    await transport.simulateMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
      },
    });
  });

  it('should list resources', async () => {
    const resource: Resource = {
      uri: 'test://resource1',
      mimeType: 'text/plain',
      content: 'test content',
    };
    server.resource(resource, resource.content);

    await transport.simulateMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'resources/list',
      params: {},
    });

    expect(transport.messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      result: {
        resources: [resource],
      },
    });
  });

  it('should list resource templates', async () => {
    const template: ResourceTemplate = {
      uriTemplate: 'test://{name}',
      mimeType: 'text/plain',
    };
    server.resourceTemplate(template);

    await transport.simulateMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'resources/templates/list',
      params: {},
    });

    expect(transport.messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      result: {
        resourceTemplates: [template],
      },
    });
  });

  it('should read a resource', async () => {
    const resource: Resource = {
      uri: 'test://resource1',
      mimeType: 'text/plain',
      content: 'test content',
    };
    server.resource(resource, resource.content);

    await transport.simulateMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'resources/read',
      params: { uri: resource.uri },
    });

    expect(transport.messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      result: {
        contents: [{
          uri: resource.uri,
          mimeType: resource.mimeType,
          text: resource.content,
        }],
      },
    });
  });

  it('should handle resource subscriptions', async () => {
    const resource: Resource = {
      uri: 'test://resource1',
      mimeType: 'text/plain',
      content: 'test content',
    };
    server.resource(resource, resource.content);

    // Subscribe to resource
    await transport.simulateMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'resources/subscribe',
      params: { uri: resource.uri },
    });

    expect(transport.messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      result: {},
    });

    // Update resource and check notification
    const newContent = 'updated content';
    server.resource({ ...resource, content: newContent }, newContent);

    expect(transport.messages[2]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/resources/list_changed',
    });

    expect(transport.messages[3]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/resources/updated',
      params: {
        uri: resource.uri,
        content: newContent,
      },
    });
  });

  it('should handle resource list change notifications', async () => {
    const resource: Resource = {
      uri: 'test://resource1',
      mimeType: 'text/plain',
      content: 'test content',
    };

    server.resource(resource, resource.content);
    expect(transport.messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/resources/list_changed',
    });
  });

  it('should handle errors for non-existent resources', async () => {
    // Try to read non-existent resource
    await transport.simulateMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'resources/read',
      params: { uri: 'test://non-existent' },
    });

    expect(transport.messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      error: {
        code: -32602,
        message: 'Resource not found: test://non-existent',
      },
    });

    // Try to subscribe to non-existent resource
    await transport.simulateMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      method: 'resources/subscribe',
      params: { uri: 'test://non-existent' },
    });

    expect(transport.messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      error: {
        code: -32602,
        message: 'Resource not found: test://non-existent',
      },
    });
  });
});
