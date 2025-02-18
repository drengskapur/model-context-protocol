/**
 * @file stdio.ts
 * @description Standard I/O transport implementation for the Model Context Protocol.
 * Provides a transport that uses process stdin/stdout for communication.
 */

import type { Readable, Writable } from 'node:stream';
import { VError } from 'verror';
import type { JSONRPCRequest, JSONRPCResponse } from './schema';
import { BaseTransport } from './transport';

/**
 * Options for StdioTransport.
 */
export interface StdioTransportOptions {
  /**
   * Input stream to read from.
   * @default process.stdin
   */
  input?: Readable;

  /**
   * Output stream to write to.
   * @default process.stdout
   */
  output?: Writable;

  /**
   * Buffer size for reading input.
   * @default 4096
   */
  bufferSize?: number;

  /**
   * Line separator.
   * @default '\n'
   */
  separator?: string;
}

/**
 * Transport implementation that uses standard I/O streams.
 */
export class StdioTransport extends BaseTransport {
  private readonly options: Required<StdioTransportOptions>;
  private buffer = '';
  private input: Readable;
  private output: Writable;

  constructor(options: StdioTransportOptions = {}) {
    super();
    this.options = {
      input: options.input ?? process.stdin,
      output: options.output ?? process.stdout,
      bufferSize: options.bufferSize ?? 4096,
      separator: options.separator ?? '\n',
    };

    this.input = this.options.input;
    this.output = this.options.output;

    // Set encoding for stdin if it's a raw stream
    if (this.input === process.stdin) {
      this.input.setEncoding('utf8');
    }
  }

  /**
   * Connects to stdin/stdout streams.
   */
  connect(): Promise<void> {
    try {
      // Setup input handling
      this.input.on('data', (data: Buffer | string) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.input.on('error', (error: Error) => {
        this.handleError(new VError(error, 'stdin error'));
      });

      this.setConnected(true);
      return Promise.resolve();
    } catch (error) {
      throw new VError(error as Error, 'Failed to connect stdio transport');
    }
  }

  /**
   * Disconnects from stdin/stdout streams.
   */
  async disconnect(): Promise<void> {
    try {
      this.input.removeAllListeners();
      this.buffer = '';
      this.setConnected(false);
    } catch (error) {
      throw new VError(error as Error, 'Failed to disconnect stdio transport');
    }
  }

  /**
   * Sends a message through stdout.
   * @param message Message to send
   */
  async send(message: JSONRPCRequest | JSONRPCResponse): Promise<void> {
    if (!this.isConnected()) {
      throw new VError('Transport not connected');
    }

    try {
      const data = `${JSON.stringify(message)}${this.options.separator}`;
      await new Promise<void>((resolve, reject) => {
        this.output.write(data, (error) => {
          if (error) {
            reject(new VError(error, 'Failed to write to stdout'));
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      throw new VError(error as Error, 'Failed to send message');
    }
  }

  /**
   * Processes the input buffer.
   */
  private processBuffer(): void {
    const lines = this.buffer.split(this.options.separator);

    // Keep the last line if it's incomplete
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line) continue;

      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch (error) {
        this.handleError(new VError(error as Error, 'Failed to parse message'));
      }
    }
  }
}
