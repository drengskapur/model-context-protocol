/**
 * @file base.ts
 * @description Base transport implementation and interfaces for the Model Context Protocol.
 * Provides core transport functionality and event handling.
 */

import EventEmitter from 'eventemitter3';
import type { JSONRPCMessage, JSONRPCRequest } from './schema';

/**
 * Event handler types for different events
 */
export type EventHandler = {
  message: (message: JSONRPCMessage) => void;
  error: (error: Error) => void;
  connect: () => void;
  disconnect: () => void;
};

/**
 * Base interface for transport implementations.
 */
export interface McpTransport {
  /**
   * Event emitter for transport events.
   */
  readonly events: EventEmitter;

  /**
   * Subscribe to transport events.
   * @param event Event name
   * @param handler Event handler
   */
  on<K extends keyof EventHandler>(event: K, handler: EventHandler[K]): void;

  /**
   * Unsubscribe from transport events.
   * @param event Event name
   * @param handler Event handler
   */
  off<K extends keyof EventHandler>(event: K, handler: EventHandler[K]): void;

  /**
   * Sends a request and returns a promise that resolves with the response.
   * @param method Method name
   * @param params Method parameters
   * @returns Promise that resolves with the response
   */
  request<T>(method: string, params?: Record<string, unknown>): Promise<T>;
}

/**
 * Base class for transport implementations.
 */
export abstract class BaseTransport implements McpTransport {
  readonly events: EventEmitter = new EventEmitter();
  protected connected = false;

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
   * Sends a request and returns a promise that resolves with the response.
   * @param method Method name
   * @param params Method parameters
   * @returns Promise that resolves with the response
   */
  abstract request<T>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T>;

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
  on<K extends keyof EventHandler>(event: K, handler: EventHandler[K]): void {
    (this.events as EventEmitter).on(event, handler);
  }

  /**
   * Unsubscribe from transport events.
   * @param event Event name
   * @param handler Event handler
   */
  off<K extends keyof EventHandler>(event: K, handler: EventHandler[K]): void {
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
