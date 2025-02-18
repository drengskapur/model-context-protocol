/**
 * @file buffer.ts
 * @description Message buffering utilities for the Model Context Protocol.
 * Provides functionality for buffering and batching messages.
 */

import type { JSONRPCRequest, JSONRPCResponse } from './schema';

/**
 * Message buffer for collecting partial messages.
 */
export class MessageBuffer {
  private buffer = '';
  private readonly separator: string;

  constructor(separator = '\n') {
    this.separator = separator;
  }

  /**
   * Appends data to the buffer.
   * @param data Data to append
   * @returns Array of complete messages
   */
  append(data: string): string[] {
    this.buffer += data;
    return this.flush();
  }

  /**
   * Flushes complete messages from the buffer.
   * @returns Array of complete messages
   */
  flush(): string[] {
    const messages = this.buffer.split(this.separator);
    this.buffer = messages.pop() || '';
    return messages.filter(Boolean);
  }

  /**
   * Gets the current buffer content.
   * @returns Current buffer content
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Clears the buffer.
   */
  clear(): void {
    this.buffer = '';
  }
}

/**
 * Serialize a message for transport.
 * @param message Message to serialize
 * @returns Serialized message string
 */
export function serializeMessage(message: JSONRPCRequest | JSONRPCResponse): string {
  return `${JSON.stringify(message)}\n`;
}
