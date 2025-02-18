/**
 * @file stdio.ts
 * @description Standard I/O transport implementation for the Model Context Protocol.
 * Provides a transport that uses process stdin/stdout for communication.
 */

import type { Readable, Writable } from 'node:stream';
import { parse } from 'valibot';
import type { JSONRPCMessage, ProgressToken } from './schema.js';
import { jsonRpcMessageSchema } from './schemas.js';
import type { McpTransport, MessageHandler } from '../transport.js';

/**
 * Configuration options for the Standard I/O transport.
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
   * Whether to end the streams on disconnect.
   * @default false
   */
  endStreamsOnDisconnect?: boolean;
}

/**
 * Transport implementation that uses standard I/O streams.
 * Useful for command-line tools and child process communication.
 */
export class StdioTransport implements McpTransport {
  private _buffer = '';
  private _started = false;
  private _messageHandlers = new Set<MessageHandler>();
  private _errorHandlers = new Set<(error: Error) => void>();
  private _stdin: Readable;
  private _stdout: Writable;
  private _options: Required<StdioTransportOptions> = {
    input: process.stdin,
    output: process.stdout,
    bufferSize: 4096,
    endStreamsOnDisconnect: false,
  };

  /**
   * Creates a new Standard I/O transport.
   * @param options Configuration options
   */
  constructor(options: StdioTransportOptions = {}) {
    this._options = {
      ...this._options,
      ...options,
    };
    this._stdin = this._options.input;
    this._stdout = this._options.output;

    // Set encoding for stdin if it's a raw stream
    if (this._stdin === process.stdin) {
      this._stdin.setEncoding('utf8');
    }
  }

  /**
   * Whether the transport is currently connected.
   */
  isConnected(): boolean {
    return this._started;
  }

  /**
   * Sends a message through the transport.
   * @param message Message to send
   * @throws {Error} If transport is not connected
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._started) {
      throw new Error('Transport not connected');
    }

    // Validate message against schema before sending
    const validatedMessage = parse(jsonRpcMessageSchema, message);
    const serialized = `${JSON.stringify(validatedMessage)}\n`;
    await new Promise<void>((resolve, reject) => {
      this._stdout.write(serialized, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Registers a handler for incoming messages.
   * @param handler Handler function
   */
  onMessage(handler: MessageHandler): void {
    this._messageHandlers.add(handler);
  }

  /**
   * Removes a message handler.
   * @param handler Handler to remove
   */
  offMessage(handler: MessageHandler): void {
    this._messageHandlers.delete(handler);
  }

  /**
   * Connects the transport.
   * Sets up stream handling and marks as connected.
   */
  async connect(): Promise<void> {
    if (this._started) {
      throw new Error(
        'StdioTransport already connected! Call close() before connecting again.'
      );
    }

    this._started = true;
    this._stdin.on('data', this._onData);
    this._stdin.on('error', this._onStreamError);

    // Ensure streams are in the correct mode
    if (this._stdin === process.stdin) {
      this._stdin.resume();
    }
  }

  /**
   * Disconnects the transport.
   * Cleans up handlers and optionally ends streams.
   */
  async disconnect(): Promise<void> {
    await this.close();
  }

  /**
   * Closes the transport.
   * Cleans up handlers and ends streams.
   */
  async close(): Promise<void> {
    if (!this._started) {
      return Promise.resolve();
    }

    this._started = false;
    this._errorHandlers.clear();
    this._messageHandlers.clear();

    // Remove event listeners
    this._stdin.removeListener('data', this._onData);
    this._stdin.removeListener('error', this._onStreamError);

    // Destroy non-process streams
    if (this._stdin !== process.stdin) {
      this._stdin.destroy();
    }
    if (this._stdout !== process.stdout) {
      this._stdout.destroy();
    }

    return Promise.resolve();
  }

  private _handleError(error: Error): void {
    if (this._errorHandlers.size > 0) {
      for (const handler of this._errorHandlers) {
        handler(error);
      }
    }
  }

  // Arrow functions to bind 'this' properly while maintaining function identity
  private _onData = (chunk: Buffer | string) => {
    try {
      this._buffer += chunk.toString();
      this.processBuffer().catch((error) => {
        this._handleError(
          new Error(`Error processing buffer: ${error.message}`)
        );
      });
    } catch (error) {
      this._handleError(
        new Error(
          `Error handling data: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  };

  private _onStreamError = (error: Error) => {
    this._handleError(new Error(`Stream error: ${error.message}`));
  };

  private processBuffer(): Promise<void> {
    return new Promise<void>((resolve) => {
      while (true) {
        const newlineIndex = this._buffer.indexOf('\n');
        if (newlineIndex === -1) {
          break;
        }

        const messageStr = this._buffer.slice(0, newlineIndex);
        this._buffer = this._buffer.slice(newlineIndex + 1);

        try {
          const message = JSON.parse(messageStr);
          this._handleMessage(message).catch((error) => {
            this._handleError(
              new Error(`Error processing message: ${error.message}`)
            );
          });
        } catch (error) {
          this._handleError(
            new Error(
              `Error parsing message: ${error instanceof Error ? error.message : String(error)}`
            )
          );
        }
      }
      resolve();
    });
  }

  private async _handleMessage(message: unknown): Promise<void> {
    try {
      // Validate message against schema
      const validatedMessage = parse(jsonRpcMessageSchema, message);
      for (const handler of this._messageHandlers) {
        try {
          await handler(validatedMessage);
        } catch (error) {
          this._handleError(
            new Error(
              `Error in message handler: ${error instanceof Error ? error.message : String(error)}`
            )
          );
        }
      }
    } catch (error) {
      this._handleError(
        new Error(
          `Error processing message: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  /**
   * Registers an error handler.
   * @param handler Handler function
   */
  onError(handler: (error: Error) => void): void {
    this._errorHandlers.add(handler);
  }

  /**
   * Removes an error handler.
   * @param handler Handler to remove
   */
  offError(handler: (error: Error) => void): void {
    this._errorHandlers.delete(handler);
  }

  /**
   * Sends progress notification.
   * @param token Progress token
   * @param progress Progress value
   * @param total Total value
   */
  public async sendProgress(
    token: ProgressToken,
    progress: number,
    total?: number
  ): Promise<void> {
    await this.send({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: {
        progressToken: token,
        progress,
        total,
      },
    });
  }

  /**
   * Sends cancel request notification.
   * @param requestId Request ID
   * @param reason Reason for cancellation
   */
  public async cancelRequest(
    requestId: string | number,
    reason?: string
  ): Promise<void> {
    await this.send({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: {
        requestId,
        reason,
      },
    });
  }
}
