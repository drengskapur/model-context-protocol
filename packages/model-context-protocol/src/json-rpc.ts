/**
 * @file json-rpc.ts
 * @description JSON-RPC transport implementation for Model Context Protocol.
 * Provides base classes for JSON-RPC client and server communication.
 */

import { EventEmitter } from 'node:events';
import { VError } from 'verror';
import type { TransportErrorHandler } from './transport';

export type RequestId = number | string | null;

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: RequestId;
  method: string;
  params?: unknown;
}

export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JSONRPCSuccessResponse {
  jsonrpc: '2.0';
  id: RequestId;
  result: unknown;
}

export interface JSONRPCErrorResponse {
  jsonrpc: '2.0';
  id: RequestId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JSONRPCResponse = JSONRPCSuccessResponse | JSONRPCErrorResponse;
export type JSONRPCMessage =
  | JSONRPCRequest
  | JSONRPCNotification
  | JSONRPCResponse;

export function isRequest(message: JSONRPCMessage): message is JSONRPCRequest {
  return 'method' in message && 'id' in message;
}

export function isNotification(
  message: JSONRPCMessage
): message is JSONRPCNotification {
  return 'method' in message && !('id' in message);
}

export function isResponse(
  message: JSONRPCMessage
): message is JSONRPCResponse {
  return ('result' in message || 'error' in message) && 'id' in message;
}

export function isSuccessResponse(
  message: JSONRPCMessage
): message is JSONRPCSuccessResponse {
  return isResponse(message) && 'result' in message;
}

export function isErrorResponse(
  message: JSONRPCMessage
): message is JSONRPCErrorResponse {
  return isResponse(message) && 'error' in message;
}

export class JSONRPCTransportError extends VError {
  constructor(message: string, cause?: Error) {
    super({ cause }, message);
    this.name = 'JSONRPCTransportError';
  }
}

export type TransportMessageHandler = (
  message: JSONRPCMessage
) => void | Promise<void>;

export interface JSONRPCEventMap {
  message: (message: JSONRPCMessage) => void;
  error: (error: Error) => void;
  connect: () => void;
  disconnect: () => void;
}

export class TypedEventEmitter<
  T extends Record<string, (...args: unknown[]) => void>,
> extends EventEmitter {
  on<K extends keyof T>(event: K, listener: T[K]): this {
    return super.on(event as string, listener);
  }

  off<K extends keyof T>(event: K, listener: T[K]): this {
    return super.off(event as string, listener);
  }

  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): boolean {
    return super.emit(event as string, ...args);
  }
}

export abstract class JSONRPCBase {
  protected readonly rpcClient: JSONRPCClient;
  protected readonly rpcServer: JSONRPCServer;
  protected readonly transport: JSONRPCTransport;
  protected readonly events: TypedEventEmitter<JSONRPCEventMap>;

  constructor(transport: JSONRPCTransport) {
    this.transport = transport;
    this.rpcClient = new JSONRPCClient(async (message) => {
      await this.transport.send(message as JSONRPCMessage);
    });
    this.rpcServer = new JSONRPCServer();
    this.events = new TypedEventEmitter();
  }

  protected async handleMessage(message: JSONRPCMessage): Promise<void> {
    try {
      // Validate message format before processing
      if (!this.validateMessage(message)) {
        throw new JSONRPCTransportError('Invalid message format');
      }

      if (isRequest(message)) {
        const response = await this.rpcServer.receive(message);
        if (response) {
          await this.transport.send(response as JSONRPCMessage);
        }
      }
      this.events.emit('message', message);
    } catch (error) {
      if (error instanceof Error) {
        this.events.emit(
          'error',
          new JSONRPCTransportError('Failed to handle message', error)
        );
      } else {
        this.events.emit(
          'error',
          new JSONRPCTransportError('Failed to handle message')
        );
      }
    }
  }

  private validateMessage(message: JSONRPCMessage): boolean {
    if (!this.validateBasicStructure(message)) {
      return false;
    }

    if (this.isRequest(message)) {
      return this.validateRequest(message);
    }

    if (this.isResponse(message)) {
      return this.validateResponse(message);
    }

    return false;
  }

  private validateBasicStructure(message: unknown): message is Record<string, unknown> {
    return message !== null && typeof message === 'object';
  }

  private validateRequest(message: Record<string, unknown>): boolean {
    if (typeof message.method !== 'string') {
      return false;
    }

    if (message.params !== undefined && typeof message.params !== 'object') {
      return false;
    }

    if (message.id !== undefined && !this.isValidId(message.id)) {
      return false;
    }

    return true;
  }

  private validateResponse(message: Record<string, unknown>): boolean {
    if (!this.isValidId(message.id)) {
      return false;
    }

    if (!('result' in message) && !('error' in message)) {
      return false;
    }

    if ('error' in message && !this.isValidError(message.error)) {
      return false;
    }

    return true;
  }

  private isValidId(id: unknown): boolean {
    return typeof id === 'string' || typeof id === 'number' || id === null;
  }

  private isValidError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const { code, message } = error as Record<string, unknown>;
    return typeof code === 'number' && typeof message === 'string';
  }

  private isRequest(message: Record<string, unknown>): boolean {
    return 'method' in message;
  }

  private isResponse(message: Record<string, unknown>): boolean {
    return 'id' in message && ('result' in message || 'error' in message);
  }
}

export interface JSONRPCTransport {
  send(message: JSONRPCMessage): Promise<void>;
  onMessage(handler: TransportMessageHandler): void;
  offMessage(handler: TransportMessageHandler): void;
  onError(handler: TransportErrorHandler): void;
  offError(handler: TransportErrorHandler): void;
  close(): Promise<void>;
}

export abstract class JsonRpcTransport implements JSONRPCTransport {
  private connected = false;
  private messageHandlers = new Set<TransportMessageHandler>();
  private errorHandlers = new Set<TransportErrorHandler>();
  private readonly _events: TypedEventEmitter<JSONRPCEventMap>;

  get events(): TypedEventEmitter<JSONRPCEventMap> {
    return this._events;
  }

  isConnected(): boolean {
    return this.connected;
  }

  protected setConnected(value: boolean): void {
    this.connected = value;
    if (value) {
      this._events.emit('connect');
    } else {
      this._events.emit('disconnect');
    }
  }

  abstract send(message: JSONRPCMessage): Promise<void>;

  onMessage(handler: TransportMessageHandler): void {
    this.messageHandlers.add(handler);
  }

  offMessage(handler: TransportMessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  onError(handler: TransportErrorHandler): void {
    this.errorHandlers.add(handler);
  }

  offError(handler: TransportErrorHandler): void {
    this.errorHandlers.delete(handler);
  }

  abstract close(): Promise<void>;

  abstract connect(): Promise<void>;

  abstract disconnect(): Promise<void>;

  on<K extends keyof JSONRPCEventMap>(
    event: K,
    handler: JSONRPCEventMap[K]
  ): void {
    this._events.addEventListener(event, handler);
  }

  off<K extends keyof JSONRPCEventMap>(
    event: K,
    handler: JSONRPCEventMap[K]
  ): void {
    this._events.removeEventListener(event, handler);
  }

  protected async handleMessage(message: unknown): Promise<void> {
    if (!this.validateMessage(message)) {
      await this.handleError(new VError('Invalid message format'));
      return;
    }

    const handlers = Array.from(this.messageHandlers);
    for (const handler of handlers) {
      try {
        await handler(message as JSONRPCMessage);
      } catch (error) {
        if (error instanceof Error) {
          await this.handleError(new VError(error, 'Handler error'));
        } else {
          await this.handleError(new VError('Handler error'));
        }
      }
    }
  }

  protected async handleError(error: Error): Promise<void> {
    this._events.emit('error', error);
    const handlers = Array.from(this.errorHandlers);
    for (const handler of handlers) {
      try {
        await handler(error);
      } catch (handlerError) {
        if (handlerError instanceof Error) {
          this._events.emit(
            'error',
            new VError(handlerError, 'Error in error handler')
          );
        } else {
          this._events.emit('error', new VError('Error in error handler'));
        }
      }
    }
  }

  /**
   * Validates a JSON-RPC message.
   * Note: This function has higher cognitive complexity due to the comprehensive
   * validation required by the JSON-RPC 2.0 specification. While it could be
   * split into smaller functions, doing so would make the validation logic
   * harder to follow and maintain. The current structure provides a clear
   * and accurate implementation of the spec.
   */
  private validateMessage(message: unknown): message is JSONRPCMessage {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const msg = message as Record<string, unknown>;

    if (msg.jsonrpc !== '2.0') {
      return false;
    }

    if ('method' in msg) {
      // Request or notification
      if (typeof msg.method !== 'string') {
        return false;
      }

      if ('id' in msg) {
        // Request
        const id = msg.id;
        if (id !== null && typeof id !== 'string' && typeof id !== 'number') {
          return false;
        }
      }

      if ('params' in msg && typeof msg.params !== 'object') {
        return false;
      }

      return true;
    }

    if ('id' in msg) {
      // Response
      const id = msg.id;
      if (id !== null && typeof id !== 'string' && typeof id !== 'number') {
        return false;
      }

      if ('result' in msg) {
        return !('error' in msg);
      }

      if ('error' in msg) {
        const error = msg.error;
        if (typeof error !== 'object' || error === null) {
          return false;
        }

        const err = error as Record<string, unknown>;
        if (typeof err.code !== 'number' || typeof err.message !== 'string') {
          return false;
        }

        return true;
      }
    }

    return false;
  }

  constructor() {
    this._events = new TypedEventEmitter();
  }
}
