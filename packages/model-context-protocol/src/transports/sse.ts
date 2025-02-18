/**
 * @file sse.ts
 * @description Server-Sent Events transport implementation for the Model Context Protocol.
 * Provides a transport that uses SSE for server-to-client communication and HTTP for client-to-server.
 */

import { parse } from 'valibot';
import type { JSONRPCMessage } from '../schema.js';
import { jsonRpcMessageSchema } from '../schemas.js';
import type { McpTransport, MessageHandler } from '../transport.js';

/**
 * Configuration options for the SSE transport.
 */
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
 * Handles message validation and distribution to registered handlers
 */
class MessageProcessor {
  private _handlers = new Set<MessageHandler>();
  private _errorHandler: (error: Error) => void;

  /**
   * Creates a new message processor instance.
   * @param errorHandler Error handler function
   */
  constructor(errorHandler: (error: Error) => void) {
    this._errorHandler = errorHandler;
  }

  /**
   * Processes an incoming message.
   * Validates the message and distributes it to registered handlers.
   * @param data Message data
   */
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

  /**
   * Parses a message from a string.
   * @param data Message data
   * @returns Parsed message
   */
  private parseMessage(data: string): JSONRPCMessage {
    try {
      return JSON.parse(data) as JSONRPCMessage;
    } catch (error) {
      throw new Error(
        `Error parsing message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validates a message and distributes it to registered handlers.
   * @param message Message to validate and distribute
   */
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

  /**
   * Distributes a message to registered handlers.
   * @param message Message to distribute
   */
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

  /**
   * Adds a message handler.
   * @param handler Handler function to add
   */
  addHandler(handler: MessageHandler): void {
    this._handlers.add(handler);
  }

  /**
   * Removes a message handler.
   * @param handler Handler function to remove
   */
  removeHandler(handler: MessageHandler): void {
    this._handlers.delete(handler);
  }

  /**
   * Clears all message handlers.
   */
  clear(): void {
    this._handlers.clear();
  }

  /**
   * Gets the number of registered message handlers.
   * @returns Number of handlers
   */
  public getHandlerCount(): number {
    return this._handlers.size;
  }

  /**
   * Checks if a message handler is registered.
   * @param handler Handler function to check
   * @returns True if handler is registered, false otherwise
   */
  public hasHandler(handler: MessageHandler): boolean {
    return this._handlers.has(handler);
  }
}

/**
 * Manages error handling and distribution
 */
class ErrorManager {
  private _handlers = new Set<(error: Error) => void>();

  /**
   * Handles an error.
   * Distributes the error to registered handlers.
   * @param error Error to handle
   */
  handleError(error: Error): void {
    if (this._handlers.size > 0) {
      for (const handler of this._handlers) {
        handler(error);
      }
    }
  }

  /**
   * Adds an error handler.
   * @param handler Handler function to add
   */
  addHandler(handler: (error: Error) => void): void {
    this._handlers.add(handler);
  }

  /**
   * Removes an error handler.
   * @param handler Handler function to remove
   */
  removeHandler(handler: (error: Error) => void): void {
    this._handlers.delete(handler);
  }

  /**
   * Clears all error handlers.
   */
  clear(): void {
    this._handlers.clear();
  }

  /**
   * Gets the number of registered error handlers.
   * @returns Number of handlers
   */
  public getHandlerCount(): number {
    return this._handlers.size;
  }

  /**
   * Checks if an error handler is registered.
   * @param handler Handler function to check
   * @returns True if handler is registered, false otherwise
   */
  public hasHandler(handler: (error: Error) => void): boolean {
    return this._handlers.has(handler);
  }
}

/**
 * Transport implementation that uses Server-Sent Events (SSE) for receiving messages
 * and HTTP POST for sending messages.
 */
export class SseTransport implements McpTransport {
  /** EventSource instance for SSE connection */
  protected _eventSource: EventSource | null = null;
  /** Transport configuration options */
  public readonly options: Required<SseTransportOptions>;
  /** Message processor for handling incoming messages */
  public readonly messageProcessor: MessageProcessor;
  /** Error manager for handling transport errors */
  public readonly errorManager: ErrorManager;

  /**
   * Creates a new SSE transport instance.
   * @param options Transport configuration options
   */
  constructor(options: SseTransportOptions) {
    this.options = {
      eventSourceUrl: options.eventSourceUrl,
      eventSourceHeaders: options.eventSourceHeaders ?? {},
      EventSource: options.EventSource ?? globalThis.EventSource,
    };

    this.errorManager = new ErrorManager();
    this.messageProcessor = new MessageProcessor((error) =>
      this.errorManager.handleError(error)
    );
  }

  /**
   * Handles an incoming SSE message.
   * @param event SSE message event
   */
  private _onMessage = (event: MessageEvent) => {
    this.messageProcessor.processMessage(event.data).catch((error) => {
      this.errorManager.handleError(error);
    });
  };

  /**
   * Handles an SSE error event.
   */
  private _onError = () => {
    this.errorManager.handleError(new Error('SSE error occurred'));
  };

  /**
   * Establishes an SSE connection.
   * @returns Promise that resolves when connected
   * @throws {Error} If connection fails
   */
  public async connect(): Promise<void> {
    if (this._eventSource) {
      throw new Error('Already connected');
    }

    const url = this.buildUrl();
    this._eventSource = new this.options.EventSource(url.toString());
    this._eventSource.onmessage = this._onMessage;
    this._eventSource.onerror = this._onError;

    return new Promise((resolve, reject) => {
      if (!this._eventSource) {
        reject(new Error('EventSource not initialized'));
        return;
      }

      const onOpen = () => {
        if (this._eventSource) {
          this._eventSource.removeEventListener('open', onOpen);
          resolve();
        }
      };

      const onError = (error: Event) => {
        if (this._eventSource) {
          this._eventSource.removeEventListener('error', onError);
          this._eventSource.close();
          this._eventSource = null;
          reject(new Error('Connection failed'));
        }
      };

      this._eventSource.addEventListener('open', onOpen);
      this._eventSource.addEventListener('error', onError);
    });
  }

  /**
   * Builds the SSE connection URL with headers.
   * @returns URL instance with headers as query parameters
   */
  private buildUrl(): URL {
    const url = new URL(this.options.eventSourceUrl);
    for (const [key, value] of Object.entries(this.options.eventSourceHeaders)) {
      url.searchParams.append(key, value);
    }
    return url;
  }

  /**
   * Disconnects the SSE connection.
   * @returns Promise that resolves when disconnected
   */
  public async disconnect(): Promise<void> {
    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }
    this.messageProcessor.clear();
    this.errorManager.clear();
    return Promise.resolve();
  }

  /**
   * Checks if the SSE connection is active.
   * @returns true if connected, false otherwise
   */
  public isConnected(): boolean {
    return this._eventSource !== null;
  }

  /**
   * Sends a message through the SSE connection.
   * Note: SSE is unidirectional, so this always throws an error.
   * @throws {Error} Always, as SSE is unidirectional
   */
  public async send(): Promise<void> {
    throw new Error('SSE transport is unidirectional (server to client only)');
  }

  /**
   * Registers a message handler.
   * @param handler Handler function to register
   */
  public onMessage(handler: MessageHandler): void {
    this.messageProcessor.addHandler(handler);
  }

  /**
   * Unregisters a message handler.
   * @param handler Handler function to unregister
   */
  public offMessage(handler: MessageHandler): void {
    this.messageProcessor.removeHandler(handler);
  }

  /**
   * Registers an error handler.
   * @param handler Handler function to register
   */
  public onError(handler: (error: Error) => void): void {
    this.errorManager.addHandler(handler);
  }

  /**
   * Unregisters an error handler.
   * @param handler Handler function to unregister
   */
  public offError(handler: (error: Error) => void): void {
    this.errorManager.removeHandler(handler);
  }

  public close(): Promise<void> {
    return this.disconnect();
  }
}
