/**
 * @file json-rpc.ts
 * @description JSON-RPC transport implementation for Model Context Protocol.
 * Provides base classes for JSON-RPC client and server communication.
 */

import { JSONRPCClient, JSONRPCServer } from 'json-rpc-2.0';
import { VError } from 'verror';
import type { JSONRPCRequest, JSONRPCResponse } from '../schema.js';
import type { McpTransport, MessageHandler } from '../transport.js';

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
   * Subscribes to incoming messages.
   * @param handler Message handler function
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  /**
   * Subscribes to transport errors.
   * @param handler Error handler function
   */
  onError(handler: (error: Error) => void): void {
    this.errorHandlers.add(handler);
  }

  /**
   * Handles an incoming message.
   * @param message Incoming message
   */
  protected async handleMessage(message: JSONRPCRequest): Promise<void> {
    try {
      const response = await this.server.receive(message);
      if (response) {
        await this.send(response);
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
  protected async sendRequest(request: JSONRPCRequest): Promise<unknown> {
    try {
      await this.send(request);
      return new Promise((resolve, reject) => {
        this.onMessage((message) => {
          if ('id' in message && message.id === request.id) {
            if ('error' in message) {
              reject(message.error);
            } else if ('result' in message) {
              resolve(message.result);
            }
          }
        });
      });
    } catch (error) {
      throw new VError(error as Error, 'Failed to send request');
    }
  }

  /**
   * Handles an error by notifying all error handlers
   * @param error Error to handle
   */
  protected handleError(error: Error): void {
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
  }
}
