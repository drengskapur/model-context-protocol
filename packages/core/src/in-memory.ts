import type { JSONRPCMessage, ProgressToken } from './schema.js';
import type { McpTransport, MessageHandler } from './transport.js';

export class InMemoryTransport implements McpTransport {
  private _connected = false;
  private _messageHandlers = new Set<MessageHandler>();
  private _errorHandlers = new Set<(error: Error) => void>();
  private _otherTransport: InMemoryTransport | null = null;
  private _messages: JSONRPCMessage[] = [];

  static createLinkedPair(): [InMemoryTransport, InMemoryTransport] {
    const transport1 = new InMemoryTransport();
    const transport2 = new InMemoryTransport();
    transport1._otherTransport = transport2;
    transport2._otherTransport = transport1;
    return [transport1, transport2];
  }

  connect(): Promise<void> {
    this._connected = true;
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this._connected = false;
    this._messageHandlers.clear();
    this._errorHandlers.clear();
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this._connected;
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._connected) {
      throw new Error('Transport not connected');
    }
    this._messages.push(message);

    // If we're in a linked pair, forward the message
    if (this._otherTransport && this._otherTransport._connected) {
      // Process in next tick to simulate async behavior
      await Promise.resolve();
      for (const handler of this._otherTransport._messageHandlers) {
        await handler(message);
      }
    }
  }

  onMessage(handler: MessageHandler): void {
    this._messageHandlers.add(handler);
  }

  offMessage(handler: MessageHandler): void {
    this._messageHandlers.delete(handler);
  }

  onError(handler: (error: Error) => void): void {
    this._errorHandlers.add(handler);
  }

  offError(handler: (error: Error) => void): void {
    this._errorHandlers.delete(handler);
  }

  async close(): Promise<void> {
    await this.disconnect();
  }

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

  // Test helper methods
  getMessages(): JSONRPCMessage[] {
    return this._messages;
  }

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

  clearMessages(): void {
    this._messages = [];
  }
}
