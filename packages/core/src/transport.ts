import type { JSONRPCMessage } from './schema.js';

/**
 * Handler function for receiving JSON-RPC messages.
 * @param message The JSON-RPC message to handle
 * @returns A Promise that resolves when the message has been handled
 */
export type MessageHandler = (message: JSONRPCMessage) => Promise<void>;

/**
 * Handler for receiving errors from a transport.
 */
export type ErrorHandler = (error: Error) => void;

/**
 * Transport layer interface for the Model Context Protocol.
 * Implementations must provide message sending and receiving capabilities.
 */
export interface McpTransport {
  /**
   * Establishes a connection to the transport endpoint.
   * @returns A Promise that resolves when the connection is established
   * @throws {Error} If the connection fails
   */
  connect(): Promise<void>;

  /**
   * Closes the transport connection.
   * @returns A Promise that resolves when the connection is closed
   */
  disconnect(): Promise<void>;

  /**
   * Sends a JSON-RPC message through the transport.
   * @param message The message to send
   * @returns A Promise that resolves when the message has been sent
   * @throws {Error} If the transport is not connected or the send fails
   */
  send(message: JSONRPCMessage): Promise<void>;

  /**
   * Registers a handler for incoming messages.
   * @param handler The handler function to register
   */
  onMessage(handler: MessageHandler): void;

  /**
   * Unregisters a previously registered message handler.
   * @param handler The handler function to unregister
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
