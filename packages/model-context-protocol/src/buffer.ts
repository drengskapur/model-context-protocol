/**
 * @file buffer.ts
 * @description Message buffering utilities for the Model Context Protocol.
 * Provides functionality for buffering and batching messages.
 */

import type { JSONRPCMessage } from './schema';

/**
 * A buffer for reading line-based text data.
 * Accumulates data until a complete line is available.
 */
export class ReadBuffer {
  /** Internal buffer storage */
  private _buffer = '';

  /**
   * Gets the current buffer contents.
   * @returns Current buffer contents
   */
  get buffer(): string {
    return this._buffer;
  }

  /**
   * Appends data to the buffer.
   * @param data Data to append, can be string or Buffer
   */
  append(data: string | Buffer): void {
    if (Buffer.isBuffer(data)) {
      this._buffer += data.toString();
    } else {
      this._buffer += data;
    }
  }

  /**
   * Reads a complete line from the buffer.
   * A line is defined as text ending with a newline character.
   * @returns The line without the newline character, or undefined if no complete line is available
   */
  read(): string | undefined {
    const newlineIndex = this._buffer.indexOf('\n');
    if (newlineIndex === -1) {
      return undefined;
    }

    const line = this._buffer.slice(0, newlineIndex);
    this._buffer = this._buffer.slice(newlineIndex + 1);
    return line;
  }

  /**
   * Clears the buffer contents.
   */
  clear(): void {
    this._buffer = '';
  }
}

/**
 * Message buffer for collecting partial messages.
 */
export class MessageBuffer {
  /**
   * The internal buffer for storing partial messages.
   */
  private buffer = '';

  /**
   * The separator used to split messages.
   */
  private readonly separator: string;

  /**
   * Creates a new message buffer.
   * @param separator The separator used to split messages. Defaults to '\n'.
   */
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
export function serializeMessage(message: JSONRPCMessage): string {
  return `${JSON.stringify(message)}\n`;
}

/**
 * Deserialize a message from transport.
 * @param lines Lines to deserialize
 * @returns Generator of deserialized messages
 */
export function* deserializeMessage(
  lines: string[]
): Generator<JSONRPCMessage> {
  for (const line of lines) {
    if (!line) {
      continue;
    }

    try {
      const message = JSON.parse(line);
      yield message;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse message: ${error.message}`);
      }
      throw new Error('Failed to parse message: Unknown error');
    }
  }
}
