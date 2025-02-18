import type { Authentication } from './auth.js';
import { withAuth } from './auth.js';
import type { McpTransport } from './transport.js';
import { RpcServer } from './transport.js';

export interface ServerOptions {
  name: string;
  version: string;
  capabilities?: Record<string, unknown>;
  auth?: Authentication;
}

export class McpServer {
  private rpcServer: RpcServer;
  private readonly options: ServerOptions;
  private initialized = false;

  constructor(transport: McpTransport, options: ServerOptions) {
    this.rpcServer = new RpcServer(transport);
    this.options = options;
    this.setupDefaultMethods();
  }

  private setupDefaultMethods(): void {
    // Initialize method
    this.rpcServer.addMethod('initialize', async (params) => {
      if (this.initialized) {
        throw new Error('Server already initialized');
      }

      const { protocolVersion, capabilities, clientInfo } = params as {
        protocolVersion: string;
        capabilities?: Record<string, unknown>;
        clientInfo: { name: string; version: string };
      };

      // Version check could be added here
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
    this.rpcServer.addMethod('ping', async () => ({ pong: true }));
  }

  async connect(): Promise<void> {
    await this.rpcServer.connect();
  }

  async disconnect(): Promise<void> {
    await this.rpcServer.disconnect();
    this.initialized = false;
  }

  addMethod(
    name: string,
    method: (params: Record<string, unknown>) => Promise<unknown>,
    roles?: string[]
  ): void {
    if (roles && this.options.auth) {
      this.rpcServer.addMethod(name, withAuth(this.options.auth, roles, method));
    } else {
      this.rpcServer.addMethod(name, method);
    }
  }

  removeMethod(name: string): void {
    this.rpcServer.removeMethod(name);
  }
} 