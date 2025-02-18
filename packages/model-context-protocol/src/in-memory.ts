/**
 * @file in-memory.ts
 * @description In-memory transport implementation for the Model Context Protocol.
 * Provides a transport that operates entirely in memory, useful for testing and local development.
 */

import { EventEmitter } from 'eventemitter3';
import { VError } from 'verror';
import type { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse } from './schema';
import { JSONRPC_VERSION } from './schema';
import type {
  McpTransport,
  MessageHandler,
  TransportEventMap,
} from './transport';

/**
 * In-memory transport implementation for testing.
 * Creates a pair of transports that communicate with each other in memory.
 */
export class InMemoryTransport implements McpTransport {
  private otherTransport: InMemoryTransport | null = null;
  private messageHandlers = new Set<MessageHandler>();
  private messages: (JSONRPCRequest | JSONRPCResponse)[] = [];
  private connected = false;
  public readonly events = new EventEmitter();

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
    this.events.emit('connect');
    return Promise.resolve();
  }

  /**
   * Disconnects the transport.
   */
  disconnect(): Promise<void> {
    this.connected = false;
    this.messageHandlers.clear();
    this.events.emit('disconnect');
    return Promise.resolve();
  }

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
    this.events.on(event, handler);
  }

  /**
   * Unsubscribe from transport events.
   */
  off<K extends keyof TransportEventMap>(
    event: K,
    handler: (...args: TransportEventMap[K]) => void
  ): void {
    this.events.off(event, handler);
  }

  /**
   * Subscribe to message events.
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
   * Sends a message through the transport.
   * @param message Message to send
   */
  async send(message: JSONRPCRequest | JSONRPCResponse): Promise<void> {
    if (!this.isConnected()) {
      throw new VError('Transport not connected');
    }

    if (!this.otherTransport) {
      throw new VError('Transport not paired');
    }

    this.messages.push(message);
    await this.otherTransport.handleMessage(message);
  }

  /**
   * Gets all messages sent through this transport.
   * @returns Array of sent messages
   */
  getMessages(): (JSONRPCRequest | JSONRPCResponse)[] {
    return this.messages;
  }

  /**
   * Simulates an incoming message for testing.
   * @param message Message to simulate
   */
  async simulateIncomingMessage(message: JSONRPCMessage): Promise<void> {
    if (typeof message !== 'object' || message === null || message.jsonrpc !== JSONRPC_VERSION) {
      throw new VError('Invalid message format');
    }

    for (const handler of this.messageHandlers) {
      await handler(message);
    }
  }

  /**
   * Clears all stored messages.
   */
  clearMessages(): void {
    this.messages = [];
  }

  /**
   * Handles an incoming message.
   * @param message Message to handle
   */
  private async handleMessage(message: unknown): Promise<void> {
    for (const handler of this.messageHandlers) {
      try {
        await handler(message);
      } catch (error) {
        this.events.emit('error', error as Error);
      }
    }
  }

  /**
   * Closes the transport.
   */
  async close(): Promise<void> {
    await this.disconnect();
    this.otherTransport = null;
  }

  /**
   * Subscribe to error events.
   * @param handler Error handler function
   */
  onError(handler: (error: Error) => void): void {
    this.events.on('error', handler);
  }

  /**
   * Unsubscribe from error events.
   * @param handler Error handler function
   */
  offError(handler: (error: Error) => void): void {
    this.events.off('error', handler);
  }
}
