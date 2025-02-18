/**
 * @file in-memory.ts
 * @description In-memory transport implementation for the Model Context Protocol.
 * Provides a transport that operates entirely in memory, useful for testing and local development.
 */

import type { JSONRPCMessage, ProgressToken } from './schema.js';
import type { McpTransport, MessageHandler } from './transport.js';

/**
 * Transport implementation that operates entirely in memory.
 * Useful for testing and scenarios where both client and server are in the same process.
 */
export class InMemoryTransport implements McpTransport {
  /** Set of registered message handlers */
  private _messageHandlers = new Set<MessageHandler>();
  /** Set of registered error handlers */
  public _errorHandlers = new Set<(error: Error) => void>();
  /** Flag indicating if the transport is connected */
  private _connected = false;
  /** Optional peer transport for bidirectional communication */
  private _otherTransport: InMemoryTransport | null = null;
  /** Message queue */
  private _messages: JSONRPCMessage[] = [];

  /**
   * Creates a new in-memory transport.
   * @param peer Optional peer transport for bidirectional communication
   */
  constructor(peer?: InMemoryTransport) {
    if (peer) {
      this._otherTransport = peer;
      peer._otherTransport = this;
    }
  }

  /**
   * Creates a linked pair of InMemoryTransport instances.
   * The two instances will be connected to each other.
   * @returns Tuple of two connected transport instances
   */
  static createLinkedPair(): [InMemoryTransport, InMemoryTransport] {
    const transport1 = new InMemoryTransport();
    const transport2 = new InMemoryTransport();

    transport1._otherTransport = transport2;
    transport2._otherTransport = transport1;

    return [transport1, transport2];
  }

  /**
   * Sends a message to the peer transport if one exists.
   * @param message Message to send
   * @throws {Error} If not connected or no peer exists
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._connected) {
      throw new Error('Transport not connected');
    }

    this._messages.push(message);

    // If we're in a linked pair, forward the message
    if (this._otherTransport?._connected) {
      // Process message in next tick to simulate async behavior
      await Promise.resolve();
      for (const handler of this._otherTransport._messageHandlers) {
        await handler(message);
      }
    }
  }

  /**
   * Receives a message and distributes it to all registered handlers.
   * @param message Received message
   * @private
   */
  private async receive(message: JSONRPCMessage): Promise<void> {
    const handlers = Array.from(this._messageHandlers);
    await Promise.all(handlers.map(handler => handler(message)));
  }

  /**
   * Registers a new message handler.
   * @param handler Handler function to register
   */
  onMessage(handler: MessageHandler): void {
    this._messageHandlers.add(handler);
  }

  /**
   * Removes a previously registered message handler.
   * @param handler Handler function to remove
   */
  offMessage(handler: MessageHandler): void {
    this._messageHandlers.delete(handler);
  }

  /**
   * Registers an error handler.
   * @param handler Handler function to register
   */
  onError(handler: (error: Error) => void): void {
    this._errorHandlers.add(handler);
  }

  /**
   * Unregisters an error handler.
   * @param handler Handler function to unregister
   */
  offError(handler: (error: Error) => void): void {
    this._errorHandlers.delete(handler);
  }

  /**
   * Connects the transport.
   * For in-memory transport, this simply sets the connected flag.
   */
  async connect(): Promise<void> {
    this._connected = true;
  }

  /**
   * Disconnects the transport.
   * Clears all handlers and the connected state.
   */
  async disconnect(): Promise<void> {
    this._messageHandlers.clear();
    this._errorHandlers.clear();
    this._connected = false;
  }

  /**
   * Checks if the transport is connected.
   * @returns true if connected, false otherwise
   */
  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Closes the transport instance.
   * @returns Promise that resolves when closed
   */
  async close(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Sends a progress notification.
   * @param token Progress token
   * @param progress Progress value
   * @param total Total value
   * @returns Promise that resolves when sent
   */
  async sendProgress(
    token: ProgressToken,
    progress: number,
    total?: number
  ): Promise<void> {
    await this.send({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: {
        progressToken: token,
        progress,
        total,
      },
    });
  }

  /**
   * Cancels a request.
   * @param requestId Request ID
   * @param reason Reason for cancellation
   * @returns Promise that resolves when sent
   */
  async cancelRequest(
    requestId: string | number,
    reason?: string
  ): Promise<void> {
    await this.send({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: {
        requestId,
        reason,
      },
    });
  }

  /**
   * Gets all messages sent through this transport.
   * @returns Array of sent messages
   */
  getMessages(): JSONRPCMessage[] {
    return this._messages;
  }

  /**
   * Simulates an incoming message.
   * @param message Message to simulate
   * @returns Promise that resolves when processed
   * @throws {Error} If not connected
   */
  async simulateIncomingMessage(message: JSONRPCMessage): Promise<void> {
    if (!this._connected) {
      throw new Error('Transport not connected');
    }
    // Process in next tick to simulate async behavior
    await Promise.resolve();
    for (const handler of this._messageHandlers) {
      await handler(message);
    }
  }

  /**
   * Clears all sent messages.
   */
  clearMessages(): void {
    this._messages = [];
  }

  /**
   * Gets the set of error handlers.
   * @returns Set of error handlers
   */
  get errorHandlers(): Set<(error: Error) => void> {
    return this._errorHandlers;
  }
}
