/**
 * @file transport.ts
 * @description Transport layer interfaces for the Model Context Protocol.
 */

import {
  JSONRPCClient,
  JSONRPCServer,
  JSONRPCRequest,
  JSONRPCResponse,
} from 'json-rpc-2.0';
import EventEmitter from 'eventemitter3';
import type { JSONRPCRequest, JSONRPCResponse } from './schema';

/**
 * Event handler types for different events
 */
type MessageEventHandler = (message: JSONRPCRequest) => void;
type ErrorEventHandler = (error: Error) => void;
type ConnectionEventHandler = () => void;

/**
 * Event types for transport events
 */
export type TransportEventMap = {
  message: [message: JSONRPCRequest];
  error: [error: Error];
  connect: [];
  disconnect: [];
};

/**
 * Base interface for event emitter functionality
 */
export interface BaseEventEmitter {
  /**
   * Adds an event listener
   * @param event Event name
   * @param handler Event handler
   */
  on<K extends keyof TransportEventMap>(
    event: K,
    handler: (...args: TransportEventMap[K]) => void
  ): void;

  /**
   * Removes an event listener
   * @param event Event name
   * @param handler Event handler
   */
  off<K extends keyof TransportEventMap>(
    event: K,
    handler: (...args: TransportEventMap[K]) => void
  ): void;
}

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
    handler: (...args: TransportEventMap[K]) => void
  ): void;

  /**
   * Unsubscribe from transport events.
   * @param event Event name
   * @param handler Event handler
   */
  off<K extends keyof TransportEventMap>(
    event: K,
    handler: (...args: TransportEventMap[K]) => void
  ): void;

  /**
   * Sends a message through the transport.
   * @param message Message to send
   */
  send(message: JSONRPCRequest | JSONRPCResponse): Promise<void>;

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
}

/**
 * Base class for transport implementations.
 */
export abstract class BaseTransport implements McpTransport {
  public readonly events: BaseEventEmitter = new EventEmitter();
  protected connected = false;

  /**
   * Sends a message through the transport.
   * @param message Message to send
   */
  abstract send(message: JSONRPCRequest | JSONRPCResponse): Promise<void>;

  /**
   * Connects the transport.
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnects the transport.
   */
  abstract disconnect(): Promise<void>;

  /**
   * Whether the transport is currently connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Subscribe to transport events.
   * @param event Event name
   * @param handler Event handler
   */
  on<K extends keyof TransportEventMap>(
    event: K,
    handler: (...args: TransportEventMap[K]) => void
  ): void {
    (this.events as EventEmitter).on(event, handler);
  }

  /**
   * Unsubscribe from transport events.
   * @param event Event name
   * @param handler Event handler
   */
  off<K extends keyof TransportEventMap>(
    event: K,
    handler: (...args: TransportEventMap[K]) => void
  ): void {
    (this.events as EventEmitter).off(event, handler);
  }

  /**
   * Handles an incoming message.
   * @param message Message to handle
   */
  protected handleMessage(message: JSONRPCRequest): void {
    (this.events as EventEmitter).emit('message', message);
  }

  /**
   * Handles a transport error.
   * @param error Error to handle
   */
  protected handleError(error: Error): void {
    (this.events as EventEmitter).emit('error', error);
  }

  /**
   * Sets the connected state.
   * @param state New connected state
   */
  protected setConnected(state: boolean): void {
    this.connected = state;
    (this.events as EventEmitter).emit(state ? 'connect' : 'disconnect');
  }
}

/**
 * Handler for receiving messages from a transport.
 */
export type MessageHandler = (message: unknown) => Promise<void>;

/**
 * Handler function type for receiving errors from a transport.
 * @param error The error that occurred
 */
export type ErrorHandler = (error: Error) => void;

/**
 * Interface for a transport that can send and receive messages.
 */
export interface McpTransport {
  /**
   * Connect to the transport.
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the transport.
   */
  disconnect(): Promise<void>;

  /**
   * Send a message through the transport.
   */
  send(message: unknown): Promise<void>;

  /**
   * Register a handler for receiving messages.
   */
  onMessage(handler: MessageHandler): void;

  /**
   * Unregister a message handler.
   */
  offMessage(handler: MessageHandler): void;

  /**
   * Close the transport and clean up any resources.
   */
  close(): Promise<void>;
}

/**
 * Base class for message processor implementations.
 * Handles common message processing functionality.
 */
export class MessageProcessor {
  /** Set of registered message handlers */
  private _handlers = new Set<MessageHandler>();
  /** Error handler function */
  private _errorHandler: (error: Error) => void;

  /**
   * Creates a new MessageProcessor instance.
   * @param errorHandler Function to call when an error occurs
   */
  constructor(errorHandler: (error: Error) => void) {
    this._errorHandler = errorHandler;
  }

  /**
   * Adds a message handler.
   * @param handler The handler function to add
   */
  addHandler(handler: MessageHandler): void {
    this._handlers.add(handler);
  }

  /**
   * Removes a message handler.
   * @param handler The handler function to remove
   */
  removeHandler(handler: MessageHandler): void {
    this._handlers.delete(handler);
  }

  /**
   * Clears all message handlers.
   */
  clear(): void {
    this._handlers.clear();
  }

  /**
   * Processes a message by passing it to all registered handlers.
   * @param message The message to process
   * @returns A Promise that resolves when all handlers have processed the message
   */
  async processMessage(message: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch (error) {
      this._errorHandler(
        error instanceof Error ? error : new Error(String(error))
      );
      return;
    }

    const promises = Array.from(this._handlers).map((handler) =>
      handler(parsed).catch((error) => {
        this._errorHandler(
          error instanceof Error ? error : new Error(String(error))
        );
      })
    );

    await Promise.all(promises);
  }
}

/**
 * Base class for error manager implementations.
 * Handles common error management functionality.
 */
export class ErrorManager {
  /** Set of registered error handlers */
  private _handlers = new Set<ErrorHandler>();

  /**
   * Adds an error handler.
   * @param handler The handler function to add
   */
  addHandler(handler: ErrorHandler): void {
    this._handlers.add(handler);
  }

  /**
   * Removes an error handler.
   * @param handler The handler function to remove
   */
  removeHandler(handler: ErrorHandler): void {
    this._handlers.delete(handler);
  }

  /**
   * Clears all error handlers.
   */
  clear(): void {
    this._handlers.clear();
  }

  /**
   * Handles an error by passing it to all registered handlers.
   * @param error The error to handle
   */
  handleError(error: Error): void {
    for (const handler of this._handlers) {
      try {
        handler(error);
      } catch (handlerError) {
        console.error('Error in error handler:', handlerError);
      }
    }
  }
}

export class RpcClient {
  private rpcClient: JSONRPCClient;
  private transport: McpTransport;

  constructor(transport: McpTransport) {
    this.transport = transport;
    this.rpcClient = new JSONRPCClient(async (jsonRPCRequest) => {
      await this.transport.send(jsonRPCRequest);
    });

    this.transport.onMessage(async (message) => {
      if (this.isJsonRpcResponse(message)) {
        await this.rpcClient.receive(message);
      }
    });
  }

  private isJsonRpcResponse(message: unknown): message is JSONRPCResponse {
    return (
      typeof message === 'object' && message !== null && 'jsonrpc' in message
    );
  }

  async connect(): Promise<void> {
    await this.transport.connect();
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    return this.rpcClient.request(method, params);
  }

  async notify(method: string, params?: unknown): Promise<void> {
    return this.rpcClient.notify(method, params);
  }
}

export class RpcServer {
  private rpcServer: JSONRPCServer;
  private transport: McpTransport;

  constructor(transport: McpTransport) {
    this.transport = transport;
    this.rpcServer = new JSONRPCServer();

    this.transport.onMessage(async (message) => {
      if (this.isJsonRpcRequest(message)) {
        const response = await this.rpcServer.receive(message);
        if (response) {
          await this.transport.send(response);
        }
      }
    });
  }

  private isJsonRpcRequest(message: unknown): message is JSONRPCRequest {
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
