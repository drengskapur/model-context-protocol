import type { Readable, Writable } from 'node:stream';
import type { McpTransport, MessageHandler } from '../transport.js';
import type { JSONRPCMessage, ProgressToken } from '../schema.js';
import { parse } from 'valibot';
import { jsonRpcMessageSchema } from '../schemas.js';

/**
 * Transport implementation that uses stdin/stdout for communication.
 * This transport is only available in Node.js environments.
 */
export class StdioTransport implements McpTransport {
  private _buffer = '';
  private _started = false;
  private _messageHandlers = new Set<MessageHandler>();
  private _errorHandlers = new Set<(error: Error) => void>();
  private _stdin: Readable;
  private _stdout: Writable;

  constructor(
    stdin: Readable = process.stdin,
    stdout: Writable = process.stdout
  ) {
    this._stdin = stdin;
    this._stdout = stdout;

    // Set encoding for stdin if it's a raw stream
    if (stdin === process.stdin) {
      stdin.setEncoding('utf8');
    }
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
            new Error(`Error parsing message: ${error instanceof Error ? error.message : String(error)}`)
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

  public onError(handler: (error: Error) => void): void {
    this._errorHandlers.add(handler);
  }

  public offError(handler: (error: Error) => void): void {
    this._errorHandlers.delete(handler);
  }

  public connect(): Promise<void> {
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

    return Promise.resolve();
  }

  public async disconnect(): Promise<void> {
    await this.close();
  }

  public close(): Promise<void> {
    if (!this._started) {
      return Promise.resolve();
    }

    this._started = false;
    this._errorHandlers.clear();
    this._messageHandlers.clear();

    if (this._stdin !== process.stdin) {
      this._stdin.destroy();
    }
    if (this._stdout !== process.stdout) {
      this._stdout.end();
    }

    return Promise.resolve();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._started) {
      throw new Error('StdioTransport not connected!');
    }

    // Validate message against schema before sending
    const validatedMessage = parse(jsonRpcMessageSchema, message);
    const serialized = JSON.stringify(validatedMessage) + '\n';
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

  public onMessage(handler: MessageHandler): void {
    this._messageHandlers.add(handler);
  }

  public offMessage(handler: MessageHandler): void {
    this._messageHandlers.delete(handler);
  }

  public async sendProgress(token: ProgressToken, progress: number, total?: number): Promise<void> {
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

  public async cancelRequest(requestId: string | number, reason?: string): Promise<void> {
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
