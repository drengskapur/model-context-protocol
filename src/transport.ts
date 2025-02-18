/**
 * @file transport.ts
 * @description Transport layer interfaces and base implementations for the Model Context Protocol.
 * Defines the contract that all transport implementations must follow.
 */

import type { JSONRPCMessage } from './schema.js';

/**
 * Handler function type for processing incoming messages.
 * Implementations should process the message and return a promise that resolves when done.
 */
export type MessageHandler = (message: JSONRPCMessage) => Promise<void>;

/**
 * Handler function type for receiving errors from a transport.
 * @param error The error that occurred
 */
export type ErrorHandler = (error: Error) => void;

/**
 * Base interface for MCP transport implementations.
 * Provides the contract for sending and receiving JSON-RPC messages.
 */
export interface McpTransport {
  /**
   * Establishes a connection to the transport endpoint.
   * @returns A Promise that resolves when the connection is established
   * @throws {Error} If the connection fails
   */
  connect(): Promise<void>;

  /**
   * Disconnects from the transport endpoint.
   * @returns A Promise that resolves when the connection is closed
   */
  disconnect(): Promise<void>;

  /**
   * Checks if the transport is currently connected.
   * @returns true if connected, false otherwise
   */
  isConnected(): boolean;

  /**
   * Sends a JSON-RPC message through the transport.
   * @param message The message to send
   * @returns A Promise that resolves when the message has been sent
   * @throws {Error} If the transport is not connected or the send fails
   */
  send(message: JSONRPCMessage): Promise<void>;

  /**
   * Registers a handler for incoming messages.
   * Multiple handlers can be registered; they will be called in registration order.
   * @param handler Function to handle incoming messages
   */
  onMessage(handler: MessageHandler): void;

  /**
   * Removes a previously registered message handler.
   * @param handler The handler function to remove
   */
  offMessage(handler: MessageHandler): void;

  /**
   * Registers a handler for transport errors.
   * @param handler The error handler function to register
   */
  onError(handler: ErrorHandler): void;

  /**
   * Unregisters a previously registered error handler.
   * @param handler The error handler function to unregister
   */
  offError(handler: ErrorHandler): void;

  /**
   * Close the transport and clean up any resources.
   */
  close(): Promise<void>;
}

/**
 * Base class for message processor implementations.
 * Handles common message processing functionality.
 */
export class MessageProcessor {
  /** Set of registered message handlers */
  private _handlers = new Set<MessageHandler>();
  /** Error handler function */
  private _errorHandler: (error: Error) => void;

  /**
   * Creates a new MessageProcessor instance.
   * @param errorHandler Function to call when an error occurs
   */
  constructor(errorHandler: (error: Error) => void) {
    this._errorHandler = errorHandler;
  }

  /**
   * Adds a message handler.
   * @param handler The handler function to add
   */
  addHandler(handler: MessageHandler): void {
    this._handlers.add(handler);
  }

  /**
   * Removes a message handler.
   * @param handler The handler function to remove
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
   * Processes a message by passing it to all registered handlers.
   * @param message The message to process
   * @returns A Promise that resolves when all handlers have processed the message
   */
  async processMessage(message: string): Promise<void> {
    let parsed: JSONRPCMessage;
    try {
      parsed = JSON.parse(message);
    } catch (error) {
      this._errorHandler(
        error instanceof Error ? error : new Error(String(error))
      );
      return;
    }

    const promises = Array.from(this._handlers).map((handler) =>
      handler(parsed).catch((error) => {
        this._errorHandler(
          error instanceof Error ? error : new Error(String(error))
        );
      })
    );

    await Promise.all(promises);
  }
}

/**
 * Base class for error manager implementations.
 * Handles common error management functionality.
 */
export class ErrorManager {
  /** Set of registered error handlers */
  private _handlers = new Set<ErrorHandler>();

  /**
   * Adds an error handler.
   * @param handler The handler function to add
   */
  addHandler(handler: ErrorHandler): void {
    this._handlers.add(handler);
  }

  /**
   * Removes an error handler.
   * @param handler The handler function to remove
   */
  removeHandler(handler: ErrorHandler): void {
    this._handlers.delete(handler);
  }

  /**
   * Clears all error handlers.
   */
  clear(): void {
    this._handlers.clear();
  }

  /**
   * Handles an error by passing it to all registered handlers.
   * @param error The error to handle
   */
  handleError(error: Error): void {
    for (const handler of this._handlers) {
      try {
        handler(error);
      } catch (handlerError) {
        console.error('Error in error handler:', handlerError);
      }
    }
  }
}
