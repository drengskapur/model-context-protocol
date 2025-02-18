import type { JSONRPCMessage } from './schema.js';

/**
 * Handler for receiving messages from a transport.
 */
export type MessageHandler = (message: JSONRPCMessage) => Promise<void>;

/**
 * Handler for receiving errors from a transport.
 */
export type ErrorHandler = (error: Error) => void;

/**
 * Interface for a transport that can send and receive messages.
 */
export interface McpTransport {
  /**
   * Connect to the transport.
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the transport.
   */
  disconnect(): Promise<void>;

  /**
   * Send a message through the transport.
   */
  send(message: JSONRPCMessage): Promise<void>;

  /**
   * Register a handler for receiving messages.
   */
  onMessage(handler: MessageHandler): void;

  /**
   * Unregister a message handler.
   */
  offMessage(handler: MessageHandler): void;

  /**
   * Register a handler for receiving errors.
   */
  onError(handler: ErrorHandler): void;

  /**
   * Unregister an error handler.
   */
  offError(handler: ErrorHandler): void;

  /**
   * Close the transport and clean up any resources.
   */
  close(): Promise<void>;
}
