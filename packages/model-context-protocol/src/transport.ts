/**
 * @file transport.ts
 * @description Transport layer interfaces and base implementations for the Model Context Protocol.
 * Provides core transport functionality for message passing and event handling.
 */

import { EventEmitter } from 'eventemitter3';
import { JSONRPCClient, JSONRPCServer } from 'json-rpc-2.0';
import type { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse, RequestId } from './schema.js';
import { VError } from 'verror';

/**
 * Event types for transport events
 */
export type TransportEventMap = {
  message: [JSONRPCRequest | (Omit<JSONRPCResponse, 'id'> & { id: RequestId })];
  error: [Error];
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
 * Handler for receiving messages from a transport.
 */
export type MessageHandler = (message: unknown) => Promise<void>;

/**
 * Handler function type for receiving errors from a transport.
 * @param error The error that occurred
 */
export type ErrorHandler = (error: Error) => void;

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
   */
  on<K extends keyof TransportEventMap>(
    event: K,
    handler: (...args: TransportEventMap[K]) => void
  ): void;

  /**
   * Unsubscribe from transport events.
   */
  off<K extends keyof TransportEventMap>(
    event: K,
    handler: (...args: TransportEventMap[K]) => void
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
 * Base class for transport implementations.
 */
export abstract class BaseTransport implements McpTransport {
  protected readonly _events: EventEmitter = new EventEmitter();
  public get events(): BaseEventEmitter {
    return {
      on: <K extends keyof TransportEventMap>(event: K, handler: (...args: TransportEventMap[K]) => void) => {
        this._events.on(event, (...args: any[]) => {
          (handler as any)(...args);
        });
      },
      off: <K extends keyof TransportEventMap>(event: K, handler: (...args: TransportEventMap[K]) => void) => {
        this._events.off(event, (...args: any[]) => {
          (handler as any)(...args);
        });
      }
    };
  }
  protected connected = false;
  private messageHandlers = new Set<MessageHandler>();
  private errorHandlers = new Set<ErrorHandler>();

  /**
   * Sends a message through the transport.
   * @param message Message to send
   */
  abstract send(message: JSONRPCMessage): Promise<void>;

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
    this._events.on(event, (...args: any[]) => {
      (handler as any)(...args);
    });
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
    this._events.off(event, (...args: any[]) => {
      (handler as any)(...args);
    });
  }

  /**
   * Register a handler for receiving messages.
   * @param handler The handler function to add
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  /**
   * Unregister a message handler.
   * @param handler The handler function to remove
   */
  offMessage(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  /**
   * Registers an error handler.
   * @param handler Error handler function
   */
  onError(handler: ErrorHandler): void {
    this.errorHandlers.add(handler);
  }

  /**
   * Unregisters an error handler.
   * @param handler Error handler function
   */
  offError(handler: ErrorHandler): void {
    this.errorHandlers.delete(handler);
  }

  /**
   * Close the transport and clean up any resources.
   */
  async close(): Promise<void> {
    await this.disconnect();
    this.messageHandlers.clear();
    this.errorHandlers.clear();
  }

  /**
   * Handles an incoming message.
   * @param message Message to handle
   */
  protected async handleMessage(message: JSONRPCRequest | JSONRPCResponse): Promise<void> {
    this._events.emit('message', message as JSONRPCRequest | (Omit<JSONRPCResponse, 'id'> & { id: RequestId }));
    const promises = Array.from(this.messageHandlers).map(handler => 
      handler(message).catch(error => this.handleError(new VError(error, 'Handler error')))
    );
    await Promise.all(promises);
  }

  /**
   * Handles a transport error.
   * @param error Error to handle
   */
  protected handleError(error: Error): void {
    this._events.emit('error', error);
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch (handlerError) {
        // Log error but don't throw to avoid crashing the transport
        this._events.emit('error', new VError(handlerError as Error, 'Error in error handler'));
      }
    }
  }

  /**
   * Sets the connected state.
   * @param state New connected state
   */
  protected setConnected(state: boolean): void {
    this.connected = state;
    this._events.emit(state ? 'connect' : 'disconnect');
  }
}

/**
 * Base class for message processor implementations.
 * Handles common message processing functionality.
 */
export class MessageProcessor {
  /** Set of registered message handlers */
  private _handlers = new Set<MessageHandler>();
  /** Error handler function */
  private _errorHandler: ErrorHandler;

  /**
   * Creates a new MessageProcessor instance.
   * @param errorHandler Function to call when an error occurs
   */
  constructor(errorHandler: ErrorHandler) {
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
        // Log error but don't throw to avoid crashing the transport
        this.handleError(new VError(handlerError as Error, 'Error in error handler'));
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

  async request<T>(method: string, params?: unknown): Promise<T> {
    const result = await this.rpcClient.request(method, params);
    return result as T;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await this.rpcClient.notify(method, params);
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
          const validResponse = response as Omit<JSONRPCResponse, 'id'> & { id: RequestId };
          await this.transport.send(validResponse);
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
