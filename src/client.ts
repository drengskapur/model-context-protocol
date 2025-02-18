import type { Authentication } from './auth.js';
import type { McpTransport } from './transport.js';
import { RpcClient } from './transport.js';

export interface ClientOptions {
  name: string;
  version: string;
  capabilities?: Record<string, unknown>;
  auth?: Authentication;
}

export class McpClient {
  private rpcClient: RpcClient;
  private readonly options: ClientOptions;
  private initialized = false;

  constructor(transport: McpTransport, options: ClientOptions) {
    this.rpcClient = new RpcClient(transport);
    this.options = options;
  }

  async connect(): Promise<void> {
    await this.rpcClient.connect();
    
    const response = await this.rpcClient.request('initialize', {
      protocolVersion: '2024-02-18',
      capabilities: this.options.capabilities,
      clientInfo: {
        name: this.options.name,
        version: this.options.version,
      },
    });

    this.initialized = true;
    await this.rpcClient.notify('initialized');
  }

  async disconnect(): Promise<void> {
    await this.rpcClient.disconnect();
    this.initialized = false;
  }

  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.initialized && method !== 'initialize') {
      throw new Error('Client not initialized');
    }

    if (this.options.auth) {
      const token = await this.options.auth.generateToken('client', ['client']);
      params = { ...(params || {}), token };
    }

    return this.rpcClient.request(method, params);
  }

  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    if (!this.initialized) {
      throw new Error('Client not initialized');
    }

    if (this.options.auth) {
      const token = await this.options.auth.generateToken('client', ['client']);
      params = { ...(params || {}), token };
    }

    return this.rpcClient.notify(method, params);
  }
} 