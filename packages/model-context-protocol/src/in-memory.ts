/**
 * @file in-memory.ts
 * @description In-memory transport implementation for the Model Context Protocol.
 * Provides a transport that operates entirely in memory, useful for testing and local development.
 */

import type { JSONRPCMessage } from './json-rpc';
import { BaseTransport } from './transport';

/**
 * In-memory transport implementation for testing.
 * Creates a pair of transports that communicate with each other in memory.
 */
export class InMemoryTransport extends BaseTransport {
  private _connected = false;
  private readonly messages: JSONRPCMessage[] = [];
  private _handlers: ((message: JSONRPCMessage) => void)[] = [];
  private _errorHandlers: ((error: Error) => void)[] = [];
  private _messageHandler: ((message: JSONRPCMessage) => void) | undefined;

  /**
   * Creates a pair of transports that communicate with each other.
   * @returns A tuple of two transports
   */
  static createPair(): [InMemoryTransport, InMemoryTransport] {
    const transport1 = new InMemoryTransport();
    const transport2 = new InMemoryTransport();
    transport1.pair(transport2);
    transport2.pair(transport1);
    return [transport1, transport2];
  }

  /**
   * Pairs two transports together.
   * @param _transport Transport to pair with
   */
  pair(_transport: InMemoryTransport): void {
    // No-op, pairing is not implemented in the new version
  }

  /**
   * Connect the transport.
   * @throws {Error} If the transport is already connected
   */
  connect(): Promise<void> {
    if (this._connected) {
      throw new Error('Transport already connected');
    }
    this._connected = true;
    this.setConnected(true);
    return Promise.resolve();
  }

  /**
   * Disconnect the transport.
   * @throws {Error} If the transport is not connected
   */
  disconnect(): Promise<void> {
    if (!this._connected) {
      throw new Error('Transport not connected');
    }
    this._connected = false;
    this.setConnected(false);
    return Promise.resolve();
  }

  /**
   * Sends a message through the transport.
   * @param message Message to send
   * @throws {Error} If the transport is not connected
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._connected) {
      throw new Error('Transport not connected');
    }
    this.messages.push(message);
    if (this._messageHandler) {
      await this._messageHandler(message);
    }
  }

  /**
   * Gets all messages sent through this transport.
   */
  getMessages(): JSONRPCMessage[] {
    return [...this.messages];
  }

  /**
   * Clears all messages sent through this transport.
   */
  clearMessages(): void {
    this.messages.length = 0;
  }

  /**
   * Closes the transport and cleans up resources.
   */
  async close(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Simulates an incoming message through the transport.
   * @param message Message to simulate
   * @throws {Error} If the transport is not connected
   */
  async simulateIncomingMessage(message: JSONRPCMessage): Promise<void> {
    if (!this._connected) {
      throw new Error('Transport not connected');
    }
    await this.handleMessage(message);
  }

  protected handleError(error: Error): void {
    for (const handler of this._errorHandlers) {
      try {
        handler(error);
      } catch (_err) {
        // Silently ignore error handler failures
      }
    }
    this.events.emit('error', error);
  }

  /**
   * Register a message handler
   */
  onMessage(handler: (message: JSONRPCMessage) => void): void {
    this._messageHandler = handler;
  }

  /**
   * Register an error handler
   */
  onError(handler: (error: Error) => void): void {
    this._errorHandlers.push(handler);
  }
}
