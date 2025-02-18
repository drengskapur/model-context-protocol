/**
 * @file in-memory.ts
 * @description In-memory transport implementation for the Model Context Protocol.
 * Provides a transport that operates entirely in memory, useful for testing and local development.
 */

import { EventEmitter } from 'eventemitter3';
import { VError } from 'verror';
import type { BaseEventEmitter, McpTransport, MessageHandler, TransportEventMap } from './transport';
import type { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse } from './schema';
import { JSONRPC_VERSION } from './schema';
import { TransportError } from './errors';

/**
 * In-memory transport implementation for testing.
 * Creates a pair of transports that communicate with each other in memory.
 */
export class InMemoryTransport implements McpTransport {
  private otherTransport: InMemoryTransport | null = null;
  private messageHandlers = new Set<MessageHandler>();
  private messages: (JSONRPCRequest | JSONRPCResponse)[] = [];
  private connected = false;
  private readonly _events = new EventEmitter();

  public get events(): BaseEventEmitter {
    return {
      on: <K extends keyof TransportEventMap>(
        event: K,
        handler: K extends 'connect' | 'disconnect' ? () => void : (...args: TransportEventMap[K]) => void
      ) => {
        this._events.on(event, handler as (...args: any[]) => void);
      },
      off: <K extends keyof TransportEventMap>(
        event: K,
        handler: K extends 'connect' | 'disconnect' ? () => void : (...args: TransportEventMap[K]) => void
      ) => {
        this._events.off(event, handler as (...args: any[]) => void);
      },
    };
  }

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
   * Creates a linked pair of transports.
   * @deprecated Use createPair() instead
   */
  static createLinkedPair(): [InMemoryTransport, InMemoryTransport] {
    return InMemoryTransport.createPair();
  }

  /**
   * Connects the transport.
   * @throws {TransportError} If the transport is not paired
   */
  connect(): Promise<void> {
    if (!this.otherTransport) {
      throw new TransportError('Transport not paired');
    }
    this.connected = true;
    this._events.emit('connect');
    return Promise.resolve();
  }

  /**
   * Disconnects the transport.
   */
  disconnect(): Promise<void> {
    this.connected = false;
    this.messageHandlers.clear();
    this._events.emit('disconnect');
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
    handler: K extends 'connect' | 'disconnect' ? () => void : (...args: TransportEventMap[K]) => void
  ): void {
    this._events.on(event, handler as (...args: any[]) => void);
  }

  /**
   * Unsubscribe from transport events.
   */
  off<K extends keyof TransportEventMap>(
    event: K,
    handler: K extends 'connect' | 'disconnect' ? () => void : (...args: TransportEventMap[K]) => void
  ): void {
    this._events.off(event, handler as (...args: any[]) => void);
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
   * @throws {TransportError} If the transport is not connected or not paired
   */
  async send(message: JSONRPCRequest | JSONRPCResponse): Promise<void> {
    if (!this.isConnected()) {
      throw new TransportError('Transport not connected');
    }

    if (!this.otherTransport) {
      throw new TransportError('Transport not paired');
    }

    try {
      this.messages.push(message);
      this.otherTransport.messages.push(message);
      await this.otherTransport.handleMessage(message);
    } catch (error) {
      throw new TransportError('Failed to send message', error as Error);
    }
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
   * @throws {TransportError} If the message format is invalid
   */
  async simulateIncomingMessage(message: JSONRPCMessage): Promise<void> {
    if (
      typeof message !== 'object' ||
      message === null ||
      message.jsonrpc !== JSONRPC_VERSION
    ) {
      throw new TransportError('Invalid message format');
    }

    this.messages.push(message as JSONRPCRequest | JSONRPCResponse);
    await this.handleMessage(message);
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
    this._events.emit('message', message);
    
    const promises = Array.from(this.messageHandlers).map((handler) => {
      try {
        const result = handler(message);
        if (result && typeof result.catch === 'function') {
          return result.catch((error) => {
            const err = error instanceof Error ? error : new Error(String(error));
            this._events.emit('error', err);
          });
        }
        return Promise.resolve();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this._events.emit('error', err);
        return Promise.resolve();
      }
    });

    await Promise.all(promises);
  }

  /**
   * Closes the transport.
   */
  async close(): Promise<void> {
    if (this.isConnected()) {
      await this.disconnect();
    }
    if (this.otherTransport) {
      this.otherTransport.otherTransport = null;
      this.otherTransport = null;
    }
  }

  /**
   * Subscribe to error events.
   * @param handler Error handler function
   */
  onError(handler: (error: Error) => void): void {
    this._events.on('error', handler);
  }

  /**
   * Unsubscribe from error events.
   * @param handler Error handler function
   */
  offError(handler: (error: Error) => void): void {
    this._events.off('error', handler);
  }
}
