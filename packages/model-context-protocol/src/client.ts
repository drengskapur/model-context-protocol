import { EventEmitter } from 'node:events';
import { VError } from 'verror';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  Result,
} from './schema';
import type { McpTransport } from './transport';

/**
 * Client options for Model Context Protocol.
 */
export interface ClientOptions {
  /**
   * Transport to use for communication.
   */
  transport: McpTransport;

  /**
   * Client capabilities.
   */
  capabilities?: Record<string, unknown>;
}

type MessageHandler = (message: unknown) => Promise<void>;

/**
 * Client implementation of the Model Context Protocol.
 */
export class McpClient {
  private readonly transport: McpTransport;
  private readonly capabilities: Record<string, unknown>;
  private initialized = false;
  private events: EventEmitter;

  constructor(options: ClientOptions) {
    this.transport = options.transport;
    this.capabilities = options.capabilities ?? {};
    this.events = new EventEmitter();

    this.transport.on('message', this.handleMessage.bind(this));
  }

  /**
   * Connects to the server.
   */
  async connect(): Promise<void> {
    try {
      await this.transport.connect();
      await this.initialize();
    } catch (error) {
      throw new VError(error as Error, 'Failed to connect to server');
    }
  }

  /**
   * Disconnects from the server.
   */
  async disconnect(): Promise<void> {
    try {
      await this.transport.disconnect();
      this.initialized = false;
    } catch (error) {
      throw new VError(error as Error, 'Failed to disconnect from server');
    }
  }

  /**
   * Sends a request to the server.
   * @param method Method name
   * @param params Method parameters
   * @returns Promise that resolves with the response
   */
  async request<T extends Result>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this.initialized && method !== 'initialize') {
      throw new VError('Client not initialized');
    }

    try {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: Math.random().toString(36).slice(2),
        method,
        params,
      };

      await this.transport.send(request);

      return new Promise((resolve, reject) => {
        const handler = (message: unknown) => {
          const rpcMessage = message as JSONRPCResponse | JSONRPCError;
          
          if ('id' in rpcMessage && rpcMessage.id === request.id) {
            this.transport.off('message', handler);
            
            if ('error' in rpcMessage) {
              const errorResponse = rpcMessage as JSONRPCError;
              reject(new VError('Server error', { cause: errorResponse.error }));
            } else {
              const resultResponse = rpcMessage as JSONRPCResponse;
              resolve(resultResponse.result as T);
            }
          }
        };

        this.transport.on('message', handler);

        // Add timeout
        setTimeout(() => {
          this.transport.off('message', handler);
          reject(new VError('Request timed out'));
        }, 30000);
      });
    } catch (error) {
      throw new VError(error as Error, `Failed to execute request: ${method}`);
    }
  }

  /**
   * Sends a notification to the server.
   * @param method Method name
   * @param params Method parameters
   */
  async notify(
    method: string,
    params?: Record<string, unknown>
  ): Promise<void> {
    if (!this.initialized) {
      throw new VError('Client not initialized');
    }

    try {
      await this.transport.send({
        jsonrpc: '2.0',
        method,
        params,
      });
    } catch (error) {
      throw new VError(
        error as Error,
        `Failed to send notification: ${method}`
      );
    }
  }

  /**
   * Initializes the client.
   */
  private async initialize(): Promise<void> {
    try {
      await this.request('initialize', {
        protocolVersion: '2024-02-18',
        capabilities: this.capabilities,
        clientInfo: {
          name: 'model-context-protocol',
          version: '0.1.0',
        },
      });

      this.initialized = true;
      await this.notify('notifications/initialized');
    } catch (error) {
      throw new VError(error as Error, 'Failed to initialize client');
    }
  }

  /**
   * Handles an incoming message.
   * @param message Incoming message
   */
  private async handleMessage(message: unknown): Promise<void> {
    try {
      const jsonRpcMessage = message as JSONRPCRequest | JSONRPCResponse | JSONRPCError;

      if ('method' in jsonRpcMessage) {
        await this.events.emit('request', jsonRpcMessage);
      } else if ('id' in jsonRpcMessage) {
        if ('error' in jsonRpcMessage) {
          await this.events.emit('error', jsonRpcMessage);
        } else {
          await this.events.emit('response', jsonRpcMessage);
        }
      }
    } catch (error) {
      await this.events.emit(
        'error',
        new VError('Failed to handle message', { cause: error })
      );
    }
  }
}
