/**
 * @file json-rpc.ts
 * @description JSON-RPC transport implementation for Model Context Protocol.
 * Provides base classes for JSON-RPC client and server communication.
 */

import { EventEmitter } from 'eventemitter3';
import { JSONRPCClient, JSONRPCServer } from 'json-rpc-2.0';
import { VError } from 'verror';
import type { JSONRPCRequest, JSONRPCResponse, JSONRPCMessage } from './schema.js';
import type { McpTransport, MessageHandler, TransportEventMap, BaseEventEmitter } from './transport.js';

/**
 * Base class for JSON-RPC transports.
 * Provides common functionality for handling JSON-RPC messages.
 */
export abstract class JsonRpcTransport implements McpTransport {
  protected client: JSONRPCClient;
  protected server: JSONRPCServer;
  private connected = false;
  private messageHandlers = new Set<MessageHandler>();
  private errorHandlers = new Set<(error: Error) => void>();
  private readonly _events = new EventEmitter();

  public get events(): BaseEventEmitter {
    return {
      on: <K extends keyof TransportEventMap>(event: K, handler: (...args: TransportEventMap[K]) => void) => {
        this._events.on(event, handler as (...args: any[]) => void);
      },
      off: <K extends keyof TransportEventMap>(event: K, handler: (...args: TransportEventMap[K]) => void) => {
        this._events.off(event, handler as (...args: any[]) => void);
      }
    };
  }

  constructor() {
    this.client = new JSONRPCClient((request) => this.sendRequest(request));
    this.server = new JSONRPCServer();
  }

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
   */
  on<K extends keyof TransportEventMap>(
    event: K,
    handler: (...args: TransportEventMap[K]) => void
  ): void {
    this._events.on(event, handler as (...args: any[]) => void);
  }

  /**
   * Unsubscribe from transport events.
   */
  off<K extends keyof TransportEventMap>(
    event: K,
    handler: (...args: TransportEventMap[K]) => void
  ): void {
    this._events.off(event, handler as (...args: any[]) => void);
  }

  /**
   * Subscribes to incoming messages.
   * @param handler Message handler function
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  /**
   * Unsubscribe from message events.
   */
  offMessage(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  /**
   * Subscribes to transport errors.
   * @param handler Error handler function
   */
  onError(handler: (error: Error) => void): void {
    this.errorHandlers.add(handler);
  }

  /**
   * Unsubscribe from error events.
   */
  offError(handler: (error: Error) => void): void {
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
   * @param message Incoming message
   */
  protected async handleMessage(message: JSONRPCRequest): Promise<void> {
    try {
      const response = await this.server.receive(message);
      if (response) {
        await this.send(response as JSONRPCResponse);
      }
      this._events.emit('message', message);
      for (const handler of this.messageHandlers) {
        await handler(message);
      }
    } catch (error) {
      this.handleError(new VError(error as Error, 'Failed to handle message'));
    }
  }

  /**
   * Sends a JSON-RPC request.
   * @param request Request to send
   * @returns Promise that resolves with the response
   */
  protected async sendRequest(request: JSONRPCRequest): Promise<void> {
    try {
      await this.send(request);
      return new Promise<void>((resolve, reject) => {
        const handler: MessageHandler = (message) => {
          if (this.isJSONRPCMessage(message) && 'id' in message && message.id === request.id) {
            this.offMessage(handler);
            if ('error' in message) {
              reject(message.error);
            } else if ('result' in message) {
              resolve();
            }
          }
          return Promise.resolve();
        };
        this.onMessage(handler);
      });
    } catch (error) {
      throw new VError(error as Error, 'Failed to send request');
    }
  }

  /**
   * Type guard for JSON-RPC messages
   */
  private isJSONRPCMessage(message: unknown): message is JSONRPCMessage {
    return (
      typeof message === 'object' &&
      message !== null &&
      'jsonrpc' in message &&
      message.jsonrpc === '2.0'
    );
  }

  /**
   * Handles an error by notifying all error handlers
   * @param error Error to handle
   */
  protected handleError(error: Error): void {
    this._events.emit('error', error);
    for (const handler of this.errorHandlers) {
      handler(error);
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
