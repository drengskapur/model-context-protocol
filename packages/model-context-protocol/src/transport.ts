import { JSONRPCClient, JSONRPCServer } from 'json-rpc-2.0';
import { VError } from 'verror';
import { TypedEventEmitter } from './json-rpc';
import type {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
} from './json-rpc.js';
import { JSONRPC_VERSION } from './schema';

/**
 * Event types for transport events
 */
export type TransportEventMap = {
  message: (message: unknown) => void;
  error: (error: unknown) => void;
  connect: () => void;
  disconnect: () => void;
};

/**
 * Base interface for event emitter functionality
 */
export type BaseEventEmitter = TypedEventEmitter<TransportEventMap>;

/**
 * Handler for receiving messages from a transport.
 */
export type TransportMessageHandler = (
  message: JSONRPCMessage
) => void | Promise<void>;

/**
 * Handler function type for receiving errors from a transport.
 * @param error The error that occurred
 */
export type TransportErrorHandler = (error: Error) => void | Promise<void>;

/**
 * Transport interface for Model Context Protocol.
 */
export interface McpTransport {
  /**
   * Event emitter for transport events.
   */
  readonly events: BaseEventEmitter;

  /**
   * Subscribe to transport events.
   * @param event Event name
   * @param handler Event handler
   */
  on<K extends keyof TransportEventMap>(
    event: K,
    handler: TransportEventMap[K]
  ): void;

  /**
   * Unsubscribe from transport events.
   * @param event Event name
   * @param handler Event handler
   */
  off<K extends keyof TransportEventMap>(
    event: K,
    handler: TransportEventMap[K]
  ): void;

  /**
   * Sends a message over the transport.
   * @param message Message to send
   */
  send(message: JSONRPCMessage): Promise<void>;

  /**
   * Connects the transport.
   */
  connect(): Promise<void>;

  /**
   * Disconnects the transport.
   */
  disconnect(): Promise<void>;

  /**
   * Whether the transport is currently connected.
   */
  isConnected(): boolean;

  /**
   * Adds a message handler
   * @param handler Handler to add
   */
  onMessage(handler: TransportMessageHandler): void;

  /**
   * Removes a message handler
   * @param handler Handler to remove
   */
  offMessage(handler: TransportMessageHandler): void;

  /**
   * Adds an error handler
   * @param handler Handler to add
   */
  onError(handler: TransportErrorHandler): void;

  /**
   * Removes an error handler
   * @param handler Handler to remove
   */
  offError(handler: TransportErrorHandler): void;

  /**
   * Closes the transport and clean up any resources.
   */
  close(): Promise<void>;
}

/**
 * Base class for transport implementations.
 */
export abstract class BaseTransport implements McpTransport {
  private connected = false;
  protected messageHandlers = new Set<TransportMessageHandler>();
  protected errorHandlers = new Set<TransportErrorHandler>();
  protected readonly _events: TypedEventEmitter<TransportEventMap>;

  constructor() {
    this._events = new TypedEventEmitter();
  }

  get events(): TypedEventEmitter<TransportEventMap> {
    return this._events;
  }

  protected abstract handleError(error: Error): void;

  protected setConnected(value: boolean): void {
    if (this.connected === value) {
      return;
    }

    this.connected = value;
    if (value) {
      this.events.emit('connect');
    } else {
      this.events.emit('disconnect');
    }
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(message: JSONRPCMessage): Promise<void>;

  onMessage(handler: TransportMessageHandler): void {
    this.messageHandlers.add(handler);
  }

  onError(handler: TransportErrorHandler): void {
    this.errorHandlers.add(handler);
  }

  offMessage(handler: TransportMessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  offError(handler: TransportErrorHandler): void {
    this.errorHandlers.delete(handler);
  }

  protected async handleMessage(message: unknown): Promise<void> {
    if (!this.isValidMessage(message)) {
      this.handleError(new VError('Invalid message format'));
      return;
    }

    for (const handler of this.messageHandlers) {
      try {
        await handler(message);
      } catch (error) {
        this.handleError(
          error instanceof Error ? error : new VError(String(error))
        );
      }
    }

    this.events.emit('message', message);
  }

  protected isValidMessage(message: unknown): message is JSONRPCMessage {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const msg = message as Record<string, unknown>;
    if (msg.jsonrpc !== JSONRPC_VERSION) {
      return false;
    }

    // Check for request
    if ('method' in msg && 'id' in msg) {
      return typeof msg.method === 'string';
    }

    // Check for notification
    if ('method' in msg && !('id' in msg)) {
      return typeof msg.method === 'string';
    }

    // Check for response or error
    if ('id' in msg) {
      return 'result' in msg || 'error' in msg;
    }

    return false;
  }

  public on<K extends keyof TransportEventMap>(
    event: K,
    handler: TransportEventMap[K]
  ): void {
    this._events.on(event, handler as (...args: any[]) => void);
  }

  public off<K extends keyof TransportEventMap>(
    event: K,
    handler: TransportEventMap[K]
  ): void {
    this._events.off(event, handler as (...args: any[]) => void);
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async close(): Promise<void> {
    await this.disconnect();
    this.messageHandlers.clear();
    this.errorHandlers.clear();
  }
}

/**
 * RPC client implementation using JSON-RPC 2.0
 */
export class RpcClient {
  private readonly rpcClient: JSONRPCClient;
  private readonly transport: McpTransport;

  constructor(transport: McpTransport) {
    this.transport = transport;
    this.rpcClient = new JSONRPCClient(
      async (jsonRPCRequest: JSONRPCRequest) => {
        await this.transport.send(jsonRPCRequest);
      }
    );

    this.transport.onMessage(async (message: JSONRPCMessage) => {
      if (this.isJsonRpcResponse(message)) {
        await this.rpcClient.receive(message);
      }
    });
  }

  private isJsonRpcResponse(
    message: JSONRPCMessage
  ): message is JSONRPCResponse {
    return (
      typeof message === 'object' &&
      message !== null &&
      'jsonrpc' in message &&
      'id' in message &&
      ('result' in message || 'error' in message)
    );
  }

  async connect(): Promise<void> {
    await this.transport.connect();
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    const result = await this.rpcClient.request(method, params);
    return result as T;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await this.rpcClient.notify(method, params);
  }
}

/**
 * RPC server implementation using JSON-RPC 2.0
 */
export class RpcServer {
  private readonly rpcServer: JSONRPCServer;
  private readonly transport: McpTransport;

  constructor(transport: McpTransport) {
    this.transport = transport;
    this.rpcServer = new JSONRPCServer();

    this.transport.onMessage(async (message: JSONRPCMessage) => {
      if (this.isJsonRpcRequest(message)) {
        const response = await this.rpcServer.receive(message);
        if (response) {
          await this.transport.send(response);
        }
      }
    });
  }

  private isJsonRpcRequest(message: JSONRPCMessage): message is JSONRPCRequest {
    return (
      typeof message === 'object' &&
      message !== null &&
      'jsonrpc' in message &&
      'method' in message
    );
  }

  async connect(): Promise<void> {
    await this.transport.connect();
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }

  addMethod(name: string, method: (params: unknown) => Promise<unknown>): void {
    this.rpcServer.addMethod(name, method);
  }

  removeMethod(name: string): void {
    this.rpcServer.removeMethod(name);
  }
}
