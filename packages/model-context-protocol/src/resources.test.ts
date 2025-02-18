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
        resources: {
          subscribe: true,
          listChanged: false,
        },
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

  it('should handle resource updates', async () => {
    const resource: Resource = {
      uri: 'test://resource1',
      name: 'Test Resource',
      mimeType: 'text/plain',
    };
    server.resource(resource);

    // Update resource metadata
    const updatedResource: Resource = {
      ...resource,
      name: 'Updated Resource',
      description: 'Updated description',
    };
    server.resource(updatedResource);

    const messages = transport.getMessages();
    expect(messages[1]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/resources/list_changed',
    });

    // Verify updated resource is returned in list
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'resources/list',
      params: {},
    });

    expect(messages[2]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      result: {
        resources: [updatedResource],
      },
    });
  });

  it('should handle invalid resource URIs', async () => {
    // Try to register resource with invalid URI
    const invalidResource: Resource = {
      uri: 'invalid-uri',
      name: 'Invalid Resource',
      mimeType: 'text/plain',
    };

    await expect(() => server.resource(invalidResource)).toThrow(
      'Invalid URI format'
    );

    // Try to read resource with invalid URI
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'resources/read',
      params: { uri: 'invalid-uri' },
    });

    const messages = transport.getMessages();
    expect(messages[0]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      error: {
        code: -32602,
        message: 'Invalid URI format',
      },
    });
  });

  it('should handle unsubscribe from resources', async () => {
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

    // Unsubscribe from resource
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      method: 'resources/unsubscribe',
      params: { uri: resource.uri },
    });

    const messages = transport.getMessages();
    expect(messages[2]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      result: {},
    });

    // Update resource - should not receive notification after unsubscribe
    const updatedResource: Resource = {
      ...resource,
      description: 'Updated description',
    };
    server.resource(updatedResource);

    expect(messages[3]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/resources/list_changed',
    });
    expect(messages).toHaveLength(4); // No resource update notification
  });

  it('should handle multiple resource subscriptions', async () => {
    const resources = [
      {
        uri: 'test://resource1',
        name: 'Test Resource 1',
        mimeType: 'text/plain',
      },
      {
        uri: 'test://resource2',
        name: 'Test Resource 2',
        mimeType: 'text/plain',
      },
    ];

    for (const resource of resources) {
      server.resource(resource);
    }

    // Subscribe to both resources
    for (const [index, resource] of resources.entries()) {
      await transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: index + 2,
        method: 'resources/subscribe',
        params: { uri: resource.uri },
      });
    }

    // Update first resource
    const updatedResource = {
      ...resources[0],
      description: 'Updated description',
    };
    server.resource(updatedResource);

    const messages = transport.getMessages();
    expect(messages).toContainEqual({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/resources/list_changed',
    });
    expect(messages).toContainEqual({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/resources/updated',
      params: { uri: resources[0].uri },
    });
  });

  it('should handle resource deletion', async () => {
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

    // Delete resource
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      method: 'resources/delete',
      params: { uri: resource.uri },
    });

    const messages = transport.getMessages();
    expect(messages[2]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      result: {},
    });

    // Verify resource is gone
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 4,
      method: 'resources/read',
      params: { uri: resource.uri },
    });

    expect(messages[3]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 4,
      error: {
        code: -32602,
        message: 'Resource not found: test://resource1',
      },
    });
  });

  it('should handle resource filtering', async () => {
    const resources = [
      {
        uri: 'test://text/doc1',
        name: 'Text Document 1',
        mimeType: 'text/plain',
      },
      {
        uri: 'test://image/pic1',
        name: 'Image 1',
        mimeType: 'image/png',
      },
      {
        uri: 'test://text/doc2',
        name: 'Text Document 2',
        mimeType: 'text/plain',
      },
    ];

    for (const resource of resources) {
      server.resource(resource);
    }

    // List with mimeType filter
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'resources/list',
      params: { mimeType: 'text/plain' },
    });

    const messages = transport.getMessages();
    expect(messages[3]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      result: {
        resources: [resources[0], resources[2]],
      },
    });

    // List with URI pattern filter
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      method: 'resources/list',
      params: { uriPattern: 'test://image/*' },
    });

    expect(messages[4]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      result: {
        resources: [resources[1]],
      },
    });
  });

  it('should handle concurrent resource operations', async () => {
    const resource: Resource = {
      uri: 'test://resource1',
      name: 'Test Resource',
      mimeType: 'text/plain',
    };
    server.resource(resource);

    // Perform multiple operations concurrently
    await Promise.all([
      transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 2,
        method: 'resources/read',
        params: { uri: resource.uri },
      }),
      transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 3,
        method: 'resources/subscribe',
        params: { uri: resource.uri },
      }),
      transport.simulateIncomingMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 4,
        method: 'resources/list',
        params: {},
      }),
    ]);

    const messages = transport.getMessages();
    expect(messages).toContainEqual(
      expect.objectContaining({
        jsonrpc: JSONRPC_VERSION,
        id: 2,
        result: expect.any(Object),
      })
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        jsonrpc: JSONRPC_VERSION,
        id: 3,
        result: expect.any(Object),
      })
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        jsonrpc: JSONRPC_VERSION,
        id: 4,
        result: expect.any(Object),
      })
    );
  });

  it('should handle resource removal', async () => {
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

    // Remove resource by overwriting it with a different URI
    const newResource: Resource = {
      uri: 'test://resource2',
      name: 'New Resource',
      mimeType: 'text/plain',
    };
    server.resource(newResource);

    const messages = transport.getMessages();
    expect(messages[2]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/resources/list_changed',
    });

    // Verify old resource is gone
    await transport.simulateIncomingMessage({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      method: 'resources/read',
      params: { uri: resource.uri },
    });

    expect(messages[3]).toMatchObject({
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      error: {
        code: -32602,
        message: 'Resource not found: test://resource1',
      },
    });
  });
});
