import type { JSONRPCRequest, JSONRPCResponse } from './schema.js';

/**
 * Handler for incoming messages.
 */
export type MessageHandler = (message: JSONRPCRequest) => Promise<JSONRPCResponse | undefined>;

/**
 * Transport interface for Model Context Protocol.
 */
export interface McpTransport {
  /**
   * Sends a message through the transport.
   * @param message Message to send
   */
  send(message: JSONRPCRequest | JSONRPCResponse): Promise<void>;

  /**
   * Subscribes to incoming messages.
   * @param handler Message handler function
   */
  onMessage(handler: MessageHandler): void;

  /**
   * Subscribes to transport errors.
   * @param handler Error handler function
   */
  onError(handler: (error: Error) => void): void;

  /**
   * Connects the transport.
   */
  connect(): Promise<void>;

  /**
   * Disconnects the transport.
   */
  disconnect(): Promise<void>;

  /**
   * Whether the transport is currently connected.
   */
  isConnected(): boolean;
}
