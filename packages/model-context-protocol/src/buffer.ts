/**
 * @file buffer.ts
 * @description Message buffering utilities for the Model Context Protocol.
 * Provides functionality for buffering and batching messages.
 */

/**
 * Configuration options for message buffering.
 */
export interface BufferOptions {
  /**
   * Maximum size of the buffer in bytes.
   * @default 1048576 (1MB)
   */
  maxSize?: number;

  /**
   * Maximum number of messages to buffer.
   * @default 1000
   */
  maxMessages?: number;

  /**
   * Time in milliseconds to wait before flushing.
   * @default 100
   */
  flushInterval?: number;
}

/**
 * A buffer for collecting and batching messages.
 * Provides automatic flushing based on size, count, or time.
 */
export class MessageBuffer {
  private buffer: Uint8Array[];
  private size: number;
  private timer: NodeJS.Timeout | null;
  private readonly options: Required<BufferOptions>;

  /**
   * Creates a new message buffer.
   * @param options Buffer configuration options
   */
  constructor(options: BufferOptions = {}) {
    this.options = {
      maxSize: options.maxSize ?? 1048576,
      maxMessages: options.maxMessages ?? 1000,
      flushInterval: options.flushInterval ?? 100,
    };
    this.buffer = [];
    this.size = 0;
    this.timer = null;
  }

  /**
   * Adds a message to the buffer.
   * Automatically flushes if buffer limits are reached.
   * @param message Message to add
   * @returns True if buffer was flushed
   */
  add(message: Uint8Array): boolean {
    if (this.size + message.length > this.options.maxSize ||
        this.buffer.length >= this.options.maxMessages) {
      this.flush();
      return true;
    }

    this.buffer.push(message);
    this.size += message.length;

    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.options.flushInterval);
    }

    return false;
  }

  /**
   * Flushes the buffer, combining all messages.
   * @returns Combined buffer contents
   */
  flush(): Uint8Array {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0) {
      return new Uint8Array(0);
    }

    const result = new Uint8Array(this.size);
    let offset = 0;

    for (const message of this.buffer) {
      result.set(message, offset);
      offset += message.length;
    }

    this.buffer = [];
    this.size = 0;

    return result;
  }

  /**
   * Returns the current size of the buffer in bytes.
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Returns the current number of messages in the buffer.
   */
  getMessageCount(): number {
    return this.buffer.length;
  }

  /**
   * Clears the buffer without returning contents.
   */
  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.buffer = [];
    this.size = 0;
  }
}

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
 * Serialize a message for transport.
 */
export function serializeMessage(message: JSONRPCMessage): string {
  return `${JSON.stringify(message)}\n`;
}

import type { JSONRPCMessage } from './schema.js';
