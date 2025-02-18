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
 * Transport implementation that uses stdin/stdout for communication.
 */
export class StdioTransport extends BaseTransport {
  private readonly input: Readable;
  private readonly output: Writable;
  private buffer = '';

  constructor(input: Readable, output: Writable) {
    super();
    this.input = input;
    this.output = output;
  }

  /**
   * Connects to stdin/stdout streams.
   */
  async connect(): Promise<void> {
    try {
      this.input.on('data', this.handleData.bind(this));
      this.input.on('error', this._handleError.bind(this));
      this.setConnected(true);
    } catch (error) {
      throw new VError(error as Error, 'Failed to connect to stdin/stdout');
    }
  }

  /**
   * Disconnects from stdin/stdout streams.
   */
  disconnect(): Promise<void> {
    try {
      this.input.removeListener('data', this.handleData.bind(this));
      this.input.removeListener('error', this._handleError.bind(this));
      this.setConnected(false);
      return Promise.resolve();
    } catch (error) {
      throw new VError(error as Error, 'Failed to disconnect from stdin/stdout');
    }
  }

  /**
   * Sends a message through stdin/stdout.
   * @param message Message to send
   */
  async send(message: JSONRPCRequest | JSONRPCResponse): Promise<void> {
    try {
      const data = JSON.stringify(message) + '\n';
      await new Promise<void>((resolve, reject) => {
        this.output.write(data, (error) => {
          if (error) {
            reject(error);
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
   * Handles incoming data from stdin.
   * @param data Data chunk from stdin
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line) {
        continue;
      }

      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch (error) {
        this._handleError(new VError(error as Error, 'Failed to parse message'));
      }
    }
  }

  /**
   * Handles a transport error.
   * @param error Error to handle
   */
  private _handleError(error: Error): void {
    this.handleError(error);
  }
}
