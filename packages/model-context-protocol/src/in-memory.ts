/**
 * @file in-memory.ts
 * @description In-memory transport implementation for the Model Context Protocol.
 * Provides a transport that operates entirely in memory, useful for testing and local development.
 */

import { VError } from 'verror';
import type { JSONRPCRequest, JSONRPCResponse } from './schema';
import { BaseTransport } from './transport';

/**
 * In-memory transport implementation for testing.
 * Creates a pair of transports that communicate with each other in memory.
 */
export class InMemoryTransport extends BaseTransport {
  private otherTransport: InMemoryTransport | null = null;
  private messageHandlers = new Set<(message: unknown) => Promise<void>>();

  /**
   * Creates a pair of linked transports.
   * @returns A tuple of two transports that can communicate with each other
   */
  static createPair(): [InMemoryTransport, InMemoryTransport] {
    const transport1 = new InMemoryTransport();
    const transport2 = new InMemoryTransport();
    transport1.otherTransport = transport2;
    transport2.otherTransport = transport1;
    return [transport1, transport2];
  }

  /**
   * Connects the transport.
   * @throws {VError} If the transport is not paired
   */
  connect(): Promise<void> {
    if (!this.otherTransport) {
      throw new VError('Transport not paired');
    }
    this.setConnected(true);
    return Promise.resolve();
  }

  /**
   * Disconnects the transport.
   */
  disconnect(): Promise<void> {
    this.setConnected(false);
    this.messageHandlers.clear();
    return Promise.resolve();
  }

  /**
   * Sends a message to the other transport.
   * @param message Message to send
   * @throws {VError} If the transport is not connected or paired
   */
  async send(message: JSONRPCRequest | JSONRPCResponse): Promise<void> {
    if (!this.isConnected()) {
      throw new VError('Transport not connected');
    }
    if (!this.otherTransport) {
      throw new VError('Transport not paired');
    }

    try {
      await this.otherTransport.handleMessage(message);
    } catch (error) {
      throw new VError(error as Error, 'Failed to send message');
    }
  }

  /**
   * Handles an incoming message.
   * @param message Message to handle
   */
  private async handleMessage(
    message: JSONRPCRequest | JSONRPCResponse
  ): Promise<void> {
    const promises = Array.from(this.messageHandlers).map((handler) =>
      handler(message).catch((error: Error) => {
        throw new VError(error, 'Handler error');
      })
    );

    await Promise.all(promises);
  }

  /**
   * Registers a message handler.
   * @param handler Handler function to register
   */
  onMessage(handler: (message: unknown) => Promise<void>): void {
    this.messageHandlers.add(handler);
  }

  /**
   * Unregisters a message handler.
   * @param handler Handler function to unregister
   */
  offMessage(handler: (message: unknown) => Promise<void>): void {
    this.messageHandlers.delete(handler);
  }

  /**
   * Closes the transport.
   */
  async close(): Promise<void> {
    await this.disconnect();
    this.otherTransport = null;
  }

  /**
   * Sends a request and returns a promise that resolves with the response.
   * @param method Method name
   * @param params Method parameters
   * @returns Promise that resolves with the response
   */
  async request<T>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this.isConnected()) {
      throw new VError('Transport not connected');
    }

    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: Math.random().toString(36).slice(2),
      method,
      params,
    };

    await this.send(request);

    return new Promise((resolve, reject) => {
      const handler: (message: unknown) => Promise<void> = (
        message: unknown
      ) => {
        const response = message as JSONRPCResponse;
        if ('id' in response && response.id === request.id) {
          this.offMessage(handler);
          if ('error' in response) {
            reject(response.error);
          } else {
            resolve(response.result as T);
          }
        }
        return Promise.resolve();
      };

      this.onMessage(handler);

      // Add timeout
      setTimeout(() => {
        this.offMessage(handler);
        reject(new VError('Request timed out'));
      }, 30000);
    });
  }
}
