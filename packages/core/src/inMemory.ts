import type { JSONRPCMessage, ProgressToken } from './schema.js';
import type { McpTransport, MessageHandler } from './transport.js';

export class InMemoryTransport implements McpTransport {
  private _connected = false;
  private _messageHandlers = new Set<MessageHandler>();
  private _errorHandlers = new Set<(error: Error) => void>();
  private _otherTransport: InMemoryTransport | null = null;

  static createLinkedPair(): [InMemoryTransport, InMemoryTransport] {
    const transport1 = new InMemoryTransport();
    const transport2 = new InMemoryTransport();
    transport1._otherTransport = transport2;
    transport2._otherTransport = transport1;
    return [transport1, transport2];
  }

  async connect(): Promise<void> {
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this._messageHandlers.clear();
    this._errorHandlers.clear();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._connected) {
      throw new Error('Transport not connected');
    }
    if (!this._otherTransport) {
      throw new Error('No linked transport');
    }
    for (const handler of this._otherTransport._messageHandlers) {
      await handler(message);
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
    this._otherTransport = null;
  }

  async sendProgress(token: ProgressToken, progress: number, total?: number): Promise<void> {
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

  async cancelRequest(requestId: string | number, reason?: string): Promise<void> {
    await this.send({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: {
        requestId,
        reason,
      },
    });
  }
}
