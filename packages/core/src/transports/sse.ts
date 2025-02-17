import { parse } from 'valibot';
import type { JSONRPCMessage } from '../schema.js';
import { jsonRpcMessageSchema } from '../schemas.js';
import type { McpTransport, MessageHandler } from '../transport.js';

/**
 * Handles message validation and distribution to registered handlers
 */
class MessageProcessor {
  private _handlers = new Set<MessageHandler>();
  private _errorHandler: (error: Error) => void;

  constructor(errorHandler: (error: Error) => void) {
    this._errorHandler = errorHandler;
  }

  async processMessage(data: unknown): Promise<void> {
    try {
      if (typeof data !== 'string') {
        throw new Error('Invalid message data type');
      }

      const message = this.parseMessage(data);
      await this.validateAndDistribute(message);
    } catch (error) {
      this._errorHandler(
        new Error(
          `Error handling message: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  private parseMessage(data: string): JSONRPCMessage {
    try {
      return JSON.parse(data) as JSONRPCMessage;
    } catch (error) {
      throw new Error(
        `Error parsing message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async validateAndDistribute(message: unknown): Promise<void> {
    try {
      const validatedMessage = parse(jsonRpcMessageSchema, message);
      await this.distributeMessage(validatedMessage);
    } catch (error) {
      throw new Error(
        `Error processing message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async distributeMessage(message: JSONRPCMessage): Promise<void> {
    for (const handler of this._handlers) {
      try {
        await handler(message);
      } catch (error) {
        this._errorHandler(
          new Error(
            `Error in message handler: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
    }
  }

  addHandler(handler: MessageHandler): void {
    this._handlers.add(handler);
  }

  removeHandler(handler: MessageHandler): void {
    this._handlers.delete(handler);
  }

  clear(): void {
    this._handlers.clear();
  }
}

/**
 * Manages error handling and distribution
 */
class ErrorManager {
  private _handlers = new Set<(error: Error) => void>();

  handleError(error: Error): void {
    if (this._handlers.size > 0) {
      for (const handler of this._handlers) {
        handler(error);
      }
    }
  }

  addHandler(handler: (error: Error) => void): void {
    this._handlers.add(handler);
  }

  removeHandler(handler: (error: Error) => void): void {
    this._handlers.delete(handler);
  }

  clear(): void {
    this._handlers.clear();
  }
}

export interface SseTransportOptions {
  /**
   * The URL to connect to for SSE events
   */
  eventSourceUrl: string;

  /**
   * Optional headers to include in the EventSource connection
   */
  eventSourceHeaders?: Record<string, string>;

  /**
   * Optional EventSource implementation to use
   * Defaults to global EventSource
   */
  EventSource?: typeof EventSource;
}

/**
 * Transport implementation that uses Server-Sent Events (SSE) for receiving messages
 * and HTTP POST for sending messages.
 */
export class SseTransport implements McpTransport {
  protected _eventSource: EventSource | null = null;
  private readonly _options: Required<SseTransportOptions>;
  private readonly _errorManager: ErrorManager;
  private readonly _messageProcessor: MessageProcessor;

  constructor(options: SseTransportOptions) {
    this._options = {
      eventSourceHeaders: {},
      EventSource: globalThis.EventSource,
      ...options,
    };

    this._errorManager = new ErrorManager();
    this._messageProcessor = new MessageProcessor((error) =>
      this._errorManager.handleError(error)
    );
  }

  private _onMessage = (event: MessageEvent) => {
    this._messageProcessor.processMessage(event.data).catch((error) => {
      this._errorManager.handleError(error);
    });
  };

  private _onError = (_event: Event) => {
    this._errorManager.handleError(new Error('SSE error occurred'));
  };

  public async connect(): Promise<void> {
    if (this._eventSource) {
      return;
    }

    const url = this.buildUrl();
    this._eventSource = new this._options.EventSource(url.toString());
    this._eventSource.onmessage = this._onMessage;
    this._eventSource.onerror = this._onError;

    await this.waitForConnection();
  }

  private buildUrl(): URL {
    const url = new URL(this._options.eventSourceUrl);
    for (const [key, value] of Object.entries(
      this._options.eventSourceHeaders
    )) {
      url.searchParams.append(key, value);
    }
    return url;
  }

  private async waitForConnection(): Promise<void> {
    if (!this._eventSource) {
      throw new Error('EventSource not initialized');
    }

    const eventSource = this._eventSource; // Store reference to avoid null checks
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        eventSource.removeEventListener('open', onOpen);
        resolve();
      };

      const onError = (_event: Event) => {
        eventSource.removeEventListener('error', onError);
        reject(new Error('Failed to connect to EventSource'));
      };

      eventSource.addEventListener('open', onOpen);
      eventSource.addEventListener('error', onError);

      if (eventSource.readyState === 1) {
        resolve();
      }
    });
  }

  public disconnect(): Promise<void> {
    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }
    this._messageProcessor.clear();
    this._errorManager.clear();
    return Promise.resolve();
  }

  public close(): Promise<void> {
    return this.disconnect();
  }

  send(_message: JSONRPCMessage): Promise<void> {
    throw new Error('SSE transport does not support sending messages');
  }

  public onMessage(handler: MessageHandler): void {
    this._messageProcessor.addHandler(handler);
  }

  public offMessage(handler: MessageHandler): void {
    this._messageProcessor.removeHandler(handler);
  }

  public onError(handler: (error: Error) => void): void {
    this._errorManager.addHandler(handler);
  }

  public offError(handler: (error: Error) => void): void {
    this._errorManager.removeHandler(handler);
  }
}
