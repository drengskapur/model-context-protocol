/**
 * @file server.ts
 * @description Server implementation for Model Context Protocol.
 * Handles incoming requests, method registration, and response routing.
 */

import { VError } from 'verror';
import type { Auth } from './auth';
import type { McpTransport } from './transport';
import { LATEST_PROTOCOL_VERSION, JSONRPC_VERSION } from './schema';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  Result,
  JSONRPCError,
} from './schema';

/**
 * Server options for Model Context Protocol.
 */
export interface ServerOptions {
  /**
   * Server name.
   */
  name: string;

  /**
   * Server version.
   */
  version: string;

  /**
   * Authentication provider.
   */
  auth?: Auth;

  /**
   * Server capabilities.
   */
  capabilities?: Record<string, unknown>;
}

/**
 * Server implementation of the Model Context Protocol.
 */
export class McpServer {
  private readonly options: ServerOptions;
  private readonly methods = new Map<
    string,
    (params: unknown) => Promise<unknown>
  >();
  private initialized = false;

  constructor(options: ServerOptions) {
    this.options = options;
    this.setupDefaultMethods();
  }

  /**
   * Sets up default methods.
   */
  private setupDefaultMethods(): void {
    // Initialize method
    this.methods.set('initialize', async (params: unknown) => {
      if (this.initialized) {
        throw new VError('Server already initialized');
      }

      if (
        typeof params !== 'object' ||
        params === null ||
        !('protocolVersion' in params) ||
        typeof params.protocolVersion !== 'string'
      ) {
        throw new VError('Invalid initialize parameters');
      }

      const initParams = params as {
        protocolVersion: string;
        capabilities?: Record<string, unknown>;
        clientInfo: { name: string; version: string };
      };

      if (initParams.protocolVersion !== LATEST_PROTOCOL_VERSION) {
        throw new VError(
          'Protocol version mismatch. Server: %s, Client: %s',
          LATEST_PROTOCOL_VERSION,
          initParams.protocolVersion
        );
      }

      this.initialized = true;

      return {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: this.options.name,
          version: this.options.version,
        },
        capabilities: this.options.capabilities ?? {},
      };
    });

    // Ping method
    this.methods.set('ping', async () => ({ pong: true }));
  }

  /**
   * Registers a method handler.
   * @param name Method name
   * @param method Method handler
   * @param roles Required roles
   */
  registerMethod(
    name: string,
    method: (params: Record<string, unknown>) => Promise<unknown>,
    roles?: string[]
  ): void {
    const wrappedMethod = async (params: unknown) => {
      if (
        params !== undefined &&
        (typeof params !== 'object' || params === null)
      ) {
        throw new VError('Invalid parameters: expected object');
      }

      if (roles && this.options.auth) {
        const { token, ...rest } = params as { token?: string } & Record<
          string,
          unknown
        >;
        if (!token) {
          throw new VError('Authentication token required');
        }

        try {
          const payload = await this.options.auth.validateToken(token);
          if (!roles.every((role) => payload.roles.includes(role))) {
            throw new VError('Insufficient permissions');
          }
          return method(rest);
        } catch (error) {
          throw new VError(error as Error, 'Authentication failed');
        }
      }

      return method((params as Record<string, unknown>) ?? {});
    };

    this.methods.set(name, wrappedMethod);
  }

  /**
   * Handles an incoming message.
   * @param message Message to handle
   */
  private async handleMessage(message: unknown): Promise<unknown> {
    try {
      if (
        typeof message !== 'object' ||
        message === null ||
        !('jsonrpc' in message) ||
        message.jsonrpc !== JSONRPC_VERSION
      ) {
        throw new VError('Invalid message format');
      }

      const msg = message as Record<string, unknown>;

      // Check for request
      if ('method' in msg && typeof msg.method === 'string') {
        const request = message as JSONRPCRequest;
        const method = this.methods.get(request.method);
        if (!method) {
          throw new VError('Method not found: %s', request.method);
        }

        const params = 'params' in request ? request.params : undefined;
        const response = await method(params);

        return response;
      }

      // Check for response
      if ('id' in msg && ('result' in msg || 'error' in msg)) {
        return message;
      }

      throw new VError('Invalid message format: expected request or response');
    } catch (error) {
      throw new VError(error as Error, 'Failed to handle message');
    }
  }

  /**
   * Connects to a transport.
   * @param transport Transport to connect to
   */
  async connect(transport: McpTransport): Promise<void> {
    try {
      transport.onMessage(async (message) => {
        try {
          const response = await this.handleMessage(message);
          if (
            typeof message === 'object' &&
            message !== null &&
            'id' in message
          ) {
            const request = message as JSONRPCRequest;
            if (
              typeof response === 'object' &&
              response !== null &&
              'error' in response &&
              typeof response.error === 'object' &&
              response.error !== null
            ) {
              await transport.send({
                jsonrpc: JSONRPC_VERSION,
                id: request.id,
                error: response.error,
              } as JSONRPCError);
            } else {
              await transport.send({
                jsonrpc: JSONRPC_VERSION,
                id: request.id,
                result: response as Result,
              } satisfies JSONRPCResponse);
            }
          }
        } catch (error) {
          if (
            typeof message === 'object' &&
            message !== null &&
            'id' in message
          ) {
            const request = message as JSONRPCRequest;
            await transport.send({
              jsonrpc: JSONRPC_VERSION,
              id: request.id,
              error: {
                code: -32000,
                message: (error as Error).message,
                data: error,
              },
            } as JSONRPCError);
          }
        }
      });

      await transport.connect();
    } catch (error) {
      throw new VError(error as Error, 'Failed to connect server');
    }
  }
}
