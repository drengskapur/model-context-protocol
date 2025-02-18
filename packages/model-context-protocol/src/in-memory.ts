/**
 * @file in-memory.ts
 * @description In-memory transport implementation for the Model Context Protocol.
 * Provides a transport that operates entirely in memory, useful for testing and local development.
 */

import type { JSONRPCRequest, JSONRPCResponse } from './schema.js';
import { JsonRpcTransport } from './transports/json-rpc.js';

/**
 * In-memory transport implementation.
 * Useful for testing and local development.
 */
export class InMemoryTransport extends JsonRpcTransport {
  private otherTransport: InMemoryTransport | null = null;
  private connected = false;

  /**
   * Pairs this transport with another transport.
   * @param other Transport to pair with
   */
  pair(other: InMemoryTransport): void {
    this.otherTransport = other;
    other.otherTransport = this;
  }

  /**
   * Connects the transport.
   */
  async connect(): Promise<void> {
    if (!this.otherTransport) {
      throw new Error('Transport not paired');
    }
    this.connected = true;
  }

  /**
   * Disconnects the transport.
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    this.otherTransport = null;
  }

  /**
   * Whether the transport is currently connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Sends a message through the transport.
   * @param message Message to send
   */
  async send(message: JSONRPCRequest | JSONRPCResponse): Promise<void> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }
    if (!this.otherTransport) {
      throw new Error('Transport not paired');
    }
    await this.otherTransport.handleMessage(message as JSONRPCRequest);
  }
}
