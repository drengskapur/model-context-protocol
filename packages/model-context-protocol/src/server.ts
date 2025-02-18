import { VError } from 'verror';
import type { Auth } from './auth';
import type { McpTransport } from './transport';

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

      const initParams = params as {
        protocolVersion: string;
        capabilities?: Record<string, unknown>;
        clientInfo: { name: string; version: string };
      };

      if (initParams.protocolVersion !== '2024-02-18') {
        throw new VError(
          'Protocol version mismatch. Server: 2024-02-18, Client: %s',
          initParams.protocolVersion
        );
      }

      this.initialized = true;

      return {
        protocolVersion: '2024-02-18',
        serverInfo: {
          name: this.options.name,
          version: this.options.version,
        },
        capabilities: this.options.capabilities,
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
      if (typeof params !== 'object' || params === null) {
        throw new VError('Invalid parameters: expected object');
      }

      if (roles && this.options.auth) {
        const { token, ...rest } = params as { token?: string };
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

      return method(params as Record<string, unknown>);
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
        !('method' in message) ||
        typeof message.method !== 'string'
      ) {
        throw new VError('Invalid message format');
      }

      const method = this.methods.get(message.method);
      if (!method) {
        throw new VError('Method not found: %s', message.method);
      }

      const params = 'params' in message ? message.params : undefined;
      return await method(params);
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
          if ('id' in message) {
            await transport.send({
              jsonrpc: '2.0',
              id: message.id,
              result: response,
            });
          }
        } catch (error) {
          if ('id' in message) {
            await transport.send({
              jsonrpc: '2.0',
              id: message.id,
              error: {
                code: -32000,
                message: (error as Error).message,
                data: error,
              },
            });
          }
        }
      });

      await transport.connect();
    } catch (error) {
      throw new VError(error as Error, 'Failed to connect server');
    }
  }
}
