/**
 * @file stdio.ts
 * @description Standard I/O transport implementation for the Model Context Protocol.
 * Provides a transport that uses process stdin/stdout for communication.
 */

import { getStdin, setRawMode } from 'stdio';
import type { Readable, Writable } from 'node:stream';
import { parse } from 'valibot';
import type { JSONRPCMessage, ProgressToken } from './schema.js';
import { jsonRpcMessageSchema } from './schemas.js';
import type { McpTransport, MessageHandler } from '../transport.js';
import { VError } from 'verror';

/**
 * Configuration options for the Standard I/O transport.
 */
export interface StdioTransportOptions {
  /**
   * Whether to use raw mode for stdin
   * @default false
   */
  rawMode?: boolean;

  /**
   * Buffer size for reading
   * @default 4096
   */
  bufferSize?: number;

  /**
   * Line separator
   * @default '\n'
   */
  separator?: string;

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
  private readonly options: Required<StdioTransportOptions>;
  private buffer = '';
  private stdin: ReturnType<typeof getStdin>;
  private _started = false;
  private _messageHandlers = new Set<MessageHandler>();
  private _errorHandlers = new Set<(error: Error) => void>();
  private _stdout: Writable;

  constructor(options: StdioTransportOptions = {}) {
    this.options = {
      rawMode: options.rawMode ?? false,
      bufferSize: options.bufferSize ?? 4096,
      separator: options.separator ?? '\n',
      input: options.input ?? process.stdin,
      output: options.output ?? process.stdout,
      endStreamsOnDisconnect: options.endStreamsOnDisconnect ?? false,
    };
    this._stdout = this.options.output;

    // Set encoding for stdin if it's a raw stream
    if (this.options.input === process.stdin) {
      this.options.input.setEncoding('utf8');
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
    try {
      this.stdin = getStdin();

      if (this.options.rawMode) {
        setRawMode(true);
      }

      // Setup input handling
      this.stdin.on('data', (data: Buffer) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.stdin.on('error', (error: Error) => {
        this.handleError(new VError(error, 'stdin error'));
      });

      this._started = true;
    } catch (error) {
      throw new VError(error as Error, 'Failed to connect stdio transport');
    }
  }

  /**
   * Disconnects the transport.
   * Cleans up handlers and optionally ends streams.
   */
  async disconnect(): Promise<void> {
    try {
      if (this.options.rawMode) {
        setRawMode(false);
      }

      this.stdin.removeAllListeners();
      this.buffer = '';
      this._started = false;

      // Destroy non-process streams
      if (this.options.input !== process.stdin) {
        this.options.input.destroy();
      }
      if (this._stdout !== process.stdout) {
        this._stdout.destroy();
      }
    } catch (error) {
      throw new VError(error as Error, 'Failed to disconnect stdio transport');
    }
  }

  /**
   * Closes the transport.
   * Cleans up handlers and ends streams.
   */
  async close(): Promise<void> {
    await this.disconnect();
  }

  private _handleError(error: Error): void {
    if (this._errorHandlers.size > 0) {
      for (const handler of this._errorHandlers) {
        handler(error);
      }
    }
  }

  private processBuffer(): void {
    const lines = this.buffer.split(this.options.separator);

    // Keep the last line if it's incomplete
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line) continue;

      try {
        const message = JSON.parse(line);
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
