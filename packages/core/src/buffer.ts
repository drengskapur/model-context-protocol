import type { JSONRPCMessage } from './schema.js';

/**
 * Buffer for reading messages from a stream.
 */
export class ReadBuffer {
  private _buffer = '';

  /**
   * Get the current buffer contents.
   */
  get buffer(): string {
    return this._buffer;
  }

  /**
   * Append data to the buffer.
   */
  append(data: string | Buffer): void {
    if (Buffer.isBuffer(data)) {
      this._buffer += data.toString();
    } else {
      this._buffer += data;
    }
  }

  /**
   * Try to read a complete message from the buffer.
   * Returns undefined if no complete message is available.
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
   * Clear the buffer.
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
