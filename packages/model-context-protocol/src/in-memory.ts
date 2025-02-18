/**
 * @file in-memory.ts
 * @description In-memory transport implementation for the Model Context Protocol.
 * Provides a transport that operates entirely in memory, useful for testing and local development.
 */

import { VError } from 'verror';
import type { McpTransport, MessageHandler } from './transport.js';

/**
 * In-memory transport implementation for testing.
 * Creates a pair of transports that communicate with each other in memory.
 */
export class InMemoryTransport implements McpTransport {
  private connected = false;
  private messageHandlers = new Set<MessageHandler>();
  private otherTransport: InMemoryTransport | null = null;

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
    this.connected = true;
    return Promise.resolve();
  }

  /**
   * Disconnects the transport.
   */
  disconnect(): Promise<void> {
    this.connected = false;
    this.messageHandlers.clear();
    return Promise.resolve();
  }

  /**
   * Sends a message to the other transport.
   * @param message Message to send
   * @throws {VError} If the transport is not connected or paired
   */
  async send(message: unknown): Promise<void> {
    if (!this.connected) {
      throw new VError('Transport not connected');
    }
    if (!this.otherTransport) {
      throw new VError('Transport not paired');
    }

    // Deliver message to all handlers on the other transport
    const promises = Array.from(this.otherTransport.messageHandlers).map(
      (handler) =>
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
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  /**
   * Unregisters a message handler.
   * @param handler Handler function to unregister
   */
  offMessage(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  /**
   * Closes the transport.
   */
  async close(): Promise<void> {
    await this.disconnect();
    this.otherTransport = null;
  }
}
