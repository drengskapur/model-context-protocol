/**
 * @file stdio.ts
 * @description Standard I/O transport implementation for the Model Context Protocol.
 * Provides a transport that uses process stdin/stdout for communication.
 */

import type { Readable, Writable } from 'node:stream';
import { createInterface, type Interface } from 'node:readline';
import { VError } from 'verror';
import type { JSONRPCMessage } from './json-rpc';
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
   * Whether to process lines or not.
   * @default true
   */
  processLines?: boolean;
}

/**
 * Transport implementation that uses standard I/O streams.
 */
export class StdioTransport extends BaseTransport {
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly rl: Interface;
  private readonly processLines: boolean;
  private buffer = '';
  private alreadyConnected = false;

  constructor(options: StdioTransportOptions = {}) {
    super();
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
    this.processLines = options.processLines ?? true;

    this.rl = createInterface({
      input: this.input,
      output: this.output,
      terminal: false,
    });

    this.setupEventHandlers();
  }

  /**
   * Connects to stdin/stdout streams.
   */
  connect(): Promise<void> {
    if (this.alreadyConnected) {
      throw new VError('Transport already connected');
    }

    try {
      this.alreadyConnected = true;
      this.setConnected(true);
      return Promise.resolve();
    } catch (error) {
      throw new VError(error as Error, 'Failed to connect stdio transport');
    }
  }

  /**
   * Disconnects from stdin/stdout streams.
   */
  disconnect(): Promise<void> {
    try {
      this.rl.close();
      this.input.removeAllListeners();
      this.buffer = '';
      this.alreadyConnected = false;
      this.setConnected(false);
      return Promise.resolve();
    } catch (error) {
      throw new VError(error as Error, 'Failed to disconnect stdio transport');
    }
  }

  /**
   * Sends a message through stdout.
   * @param message Message to send
   */
  async send(message: unknown): Promise<void> {
    if (!this.isConnected()) {
      throw new VError('Transport not connected');
    }

    try {
      const data = `${JSON.stringify(message)}\n`;
      await new Promise<void>((resolve, reject) => {
        this.output.write(data, (error) => {
          if (error) {
            reject(new VError(error, 'Write error'));
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      if (error instanceof VError && error.message === 'Write error') {
        throw error;
      }
      throw new VError(error as Error, 'Failed to send message');
    }
  }

  private setupEventHandlers(): void {
    if (this.processLines) {
      this.rl.on('line', async (line: string) => {
        try {
          await this.handleLine(line);
        } catch (err) {
          this.handleError(err instanceof Error ? err : new Error(String(err)));
        }
      });
    } else {
      this.input.on('data', async (chunk: Buffer) => {
        try {
          await this.handleData(chunk);
        } catch (err) {
          this.handleError(err instanceof Error ? err : new Error(String(err)));
        }
      });
    }

    this.input.on('end', () => {
      this.disconnect().catch((err) => {
        this.handleError(err instanceof Error ? err : new Error(String(err)));
      });
    });

    this.input.on('error', (err: Error) => {
      this.handleError(err);
    });
  }

  private async handleLine(line: string): Promise<void> {
    try {
      const message = JSON.parse(line);
      await this.handleMessage(message);
    } catch (error) {
      this.handleError(new VError(error as Error, 'Failed to parse message'));
    }
  }

  private async handleData(chunk: Buffer): Promise<void> {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');

    // Keep the last line if it's incomplete
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line) {
        continue;
      }

      try {
        const message = JSON.parse(line);
        await this.handleMessage(message);
      } catch (error) {
        this.handleError(new VError(error as Error, 'Failed to parse message'));
      }
    }
  }

  protected handleError(error: Error): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch (err) {
        console.error('Error in error handler:', err);
      }
    }
    this.events.emit('error', error);
  }
}
