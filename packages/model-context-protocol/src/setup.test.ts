import { McpServer } from '../src/server';
import { McpClient } from '../src/client';
import { InMemoryTransport } from '../src/in-memory';
import type { JSONRPCRequest, JSONRPCResponse } from '../src/schema';

/**
 * Creates a test server with an in-memory transport.
 */
export function createTestServer() {
  const server = new McpServer({
    name: 'test-server',
    version: '1.0.0',
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createPair();

  return {
    server,
    transport: serverTransport,
    clientTransport,
  };
}

/**
 * Creates a test client with an in-memory transport.
 */
export function createTestClient() {
  const client = new McpClient({
    name: 'test-client',
    version: '1.0.0',
    capabilities: {
      prompts: {},
      resources: {},
      tools: {},
    },
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createPair();

  return {
    client,
    transport: clientTransport,
    serverTransport,
  };
}

/**
 * Creates a connected client-server pair.
 */
export async function createConnectedPair() {
  const { server, transport: serverTransport } = createTestServer();
  const { client, transport: clientTransport } = createTestClient();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { server, client, serverTransport, clientTransport };
}

/**
 * Waits for a message that matches the predicate.
 * @param transport Transport to wait for message on
 * @param predicate Predicate to match message against
 * @returns Promise that resolves with the matched message
 */
function waitForMessage<T extends JSONRPCRequest | JSONRPCResponse>(
  transport: InMemoryTransport,
  predicate: (message: T) => boolean
): Promise<T> {
  return new Promise((resolve) => {
    transport.onMessage((message) => {
      if (predicate(message as T)) {
        resolve(message as T);
      }
    });
  });
}

/**
 * Helper to collect messages over a period of time.
 */
export async function collectMessages(
  transport: InMemoryTransport,
  duration: number
): Promise<(JSONRPCRequest | JSONRPCResponse)[]> {
  const messages: (JSONRPCRequest | JSONRPCResponse)[] = [];
  transport.onMessage(async (message) => messages.push(message));
  await new Promise((resolve) => setTimeout(resolve, duration));
  return messages;
}
