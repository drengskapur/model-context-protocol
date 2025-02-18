import EventEmitter from 'eventemitter3';
import type { JSONRPCRequest, JSONRPCResponse } from './schema';

/**
 * Handler for incoming messages.
 */
export type MessageHandler = (
  message: JSONRPCRequest
) => Promise<JSONRPCResponse | undefined>;

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
 * Base transport interface for the Model Context Protocol.
 */
export interface McpTransport {
  /**
   * Registers an event handler.
   * @param event Event name
   * @param handler Event handler
   */
  on(
    event: 'message' | 'error' | 'connect' | 'disconnect',
    handler: (message?: unknown) => void
  ): void;

  /**
   * Unregisters an event handler.
   * @param event Event name
   * @param handler Event handler
   */
  off(
    event: 'message' | 'error' | 'connect' | 'disconnect',
    handler: (message?: unknown) => void
  ): void;

  /**
   * Sends a request and returns a promise that resolves with the response.
   * @param method Method name
   * @param params Method parameters
   * @returns Promise that resolves with the response
   */
  request<T>(method: string, params?: Record<string, unknown>): Promise<T>;
}

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
