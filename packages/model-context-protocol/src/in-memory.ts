/**
 * @file in-memory.ts
 * @description In-memory transport implementation for the Model Context Protocol.
 * Provides a transport that operates entirely in memory, useful for testing and local development.
 */

import { EventEmitter } from 'eventemitter3';
import { TransportError } from './errors';
import type { JSONRPCRequest, JSONRPCResponse } from './schema';
import { JSONRPC_VERSION } from './schema';
import type {
  McpTransport,
  MessageHandler,
  TransportEventMap,
} from './transport';

interface BaseEventEmitter {
  on<K extends keyof TransportEventMap>(
    event: K,
    listener: (...args: TransportEventMap[K]) => void
  ): void;
  off<K extends keyof TransportEventMap>(
    event: K,
    listener: (...args: TransportEventMap[K]) => void
  ): void;
  removeListener<K extends keyof TransportEventMap>(
    event: K,
    listener: (...args: TransportEventMap[K]) => void
  ): void;
  emit<K extends keyof TransportEventMap>(
    event: K,
    ...args: TransportEventMap[K]
  ): boolean;
}

/**
 * In-memory transport implementation for testing.
 * Creates a pair of transports that communicate with each other in memory.
 */
export class InMemoryTransport implements McpTransport {
  private otherTransport: InMemoryTransport | null = null;
  private messageHandlers = new Set<MessageHandler>();
  private messages: Array<JSONRPCRequest | JSONRPCResponse> = [];
  private _connected = false;
  private readonly _events = new EventEmitter();

  /**
   * Creates a pair of transports that communicate with each other.
   * @returns A tuple of two transports
   */
  public static createPair(): [InMemoryTransport, InMemoryTransport] {
    const transport1 = new InMemoryTransport();
    const transport2 = new InMemoryTransport();
    transport1.pair(transport2);
    return [transport1, transport2];
  }

  public get events(): BaseEventEmitter {
    return {
      on: <K extends keyof TransportEventMap>(
        event: K,
        listener: (...args: TransportEventMap[K]) => void
      ) => {
        this._events.on(event, listener);
      },
      off: <K extends keyof TransportEventMap>(
        event: K,
        listener: (...args: TransportEventMap[K]) => void
      ) => {
        this._events.off(event, listener);
      },
      removeListener: <K extends keyof TransportEventMap>(
        event: K,
        listener: (...args: TransportEventMap[K]) => void
      ) => {
        this._events.removeListener(event, listener);
      },
      emit: <K extends keyof TransportEventMap>(
        event: K,
        ...args: TransportEventMap[K]
      ) => {
        return this._events.emit(event, ...args);
      },
    };
  }

  /**
   * Pairs two transports together.
   * @param transport Transport to pair with
   */
  public pair(transport: InMemoryTransport): void {
    this.otherTransport = transport;
    transport.otherTransport = this;
  }

  /**
   * Subscribe to message events.
   */
  public onMessage(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  /**
   * Unsubscribe from message events.
   */
  public offMessage(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  /**
   * Connects the transport.
   * @throws {TransportError} If the transport is not paired
   */
  public async connect(): Promise<void> {
    if (!this.otherTransport) {
      throw new TransportError('Transport not paired');
    }
    if (this._connected) {
      throw new TransportError('Transport already connected');
    }
    this._connected = true;
    await Promise.resolve(); // Ensure async behavior
    this._events.emit('connect');
  }

  /**
   * Disconnects the transport.
   */
  public async disconnect(): Promise<void> {
    if (!this._connected) {
      return;
    }
    this._connected = false;
    this.messageHandlers.clear();
    await Promise.resolve(); // Ensure async behavior
    this._events.emit('disconnect');
  }

  /**
   * Whether the transport is currently connected.
   */
  public isConnected(): boolean {
    return this._connected;
  }

  /**
   * Sends a message through the transport.
   * @param message Message to send
   * @throws {TransportError} If the transport is not connected or not paired
   */
  public async send(message: JSONRPCRequest | JSONRPCResponse): Promise<void> {
    if (!this.otherTransport) {
      throw new TransportError('Transport not paired');
    }

    if (!this._connected) {
      throw new TransportError('Transport not connected');
    }

    try {
      this.messages.push(message);
      await this.otherTransport.handleMessage(message);
    } catch (error) {
      throw new TransportError('Failed to send message', error as Error);
    }
  }

  /**
   * Gets all messages sent through this transport.
   * @returns Array of sent messages
   */
  public getMessages(): Array<JSONRPCRequest | JSONRPCResponse> {
    return this.messages;
  }

  /**
   * Simulates an incoming message for testing.
   * @param message Message to simulate
   * @throws {TransportError} If the message format is invalid
   */
  public async simulateMessage(
    message: JSONRPCRequest | JSONRPCResponse
  ): Promise<void> {
    if (!this._connected) {
      throw new TransportError('Transport not connected');
    }

    this.validateMessage(message);
    this.messages.push(message);
    await this.handleMessage(message);
  }

  /**
   * Clears all stored messages.
   */
  public clearMessages(): void {
    this.messages = [];
  }

  /**
   * Closes the transport and cleans up resources.
   */
  public async close(): Promise<void> {
    await this.disconnect();
    this.otherTransport = null;
    this.messages = [];
    this.messageHandlers.clear();
  }

  /**
   * Handles an incoming message.
   * @param message Message to handle
   */
  private async handleMessage(message: unknown): Promise<void> {
    this._events.emit('message', message);

    const promises = Array.from(this.messageHandlers).map(async (handler) => {
      try {
        await handler(message);
      } catch (error) {
        throw new TransportError('Failed to handle message', error as Error);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Validates a message.
   * @param message Message to validate
   * @throws {TransportError} If the message format is invalid
   */
  private validateMessage(message: unknown): void {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('jsonrpc' in message)
    ) {
      throw new TransportError('Invalid message format');
    }

    if ((message as { jsonrpc: string }).jsonrpc !== JSONRPC_VERSION) {
      throw new TransportError('Invalid JSON-RPC version');
    }
  }

  public on<K extends keyof TransportEventMap>(
    event: K,
    handler: K extends 'connect' | 'disconnect'
      ? () => void
      : (...args: TransportEventMap[K]) => void
  ): void {
    this._events.on(event, handler);
  }

  public off<K extends keyof TransportEventMap>(
    event: K,
    handler: K extends 'connect' | 'disconnect'
      ? () => void
      : (...args: TransportEventMap[K]) => void
  ): void {
    this._events.off(event, handler);
  }

  public onError(handler: (error: Error) => void): void {
    this._events.on('error', handler);
  }

  public offError(handler: (error: Error) => void): void {
    this._events.off('error', handler);
  }
}
