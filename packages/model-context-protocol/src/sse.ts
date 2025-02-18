/**
 * @file sse.ts
 * @description Server-Sent Events transport implementation for the Model Context Protocol.
 * Provides a transport that uses SSE for communication.
 */

import { VError } from 'verror';
import type { JSONRPCMessage } from './json-rpc';
import { BaseTransport } from './transport';

/**
 * Options for SSE transport.
 */
export interface SseTransportOptions {
  /**
   * URL of the SSE endpoint.
   */
  url: string;

  /**
   * Custom headers to include.
   */
  headers?: Record<string, string>;
}

/**
 * SSE transport implementation using EventSource.
 */
export class SseTransport extends BaseTransport {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private eventSource: EventSource | null = null;
  private _connected = false;

  constructor(options: SseTransportOptions) {
    super();
    this.url = options.url;
    this.headers = options.headers ?? {};
  }

  /**
   * Connects to the SSE stream.
   */
  public async connect(): Promise<void> {
    if (this._connected) {
      throw new VError('Transport already connected');
    }

    try {
      this.eventSource = new EventSource(this.url, {
        withCredentials: true,
      });

      this.eventSource.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          await this.handleMessage(message);
        } catch (error) {
          this.handleError(
            error instanceof Error ? error : new VError(String(error))
          );
        }
      };

      this.eventSource.onerror = (_error) => {
        this.handleError(new VError('SSE connection error'));
      };

      this._connected = true;
      this.setConnected(true);
    } catch (error) {
      throw new VError(
        {
          name: 'SSEConnectionError',
          cause: error instanceof Error ? error : undefined,
        },
        'Failed to connect to SSE endpoint'
      );
    }
  }

  /**
   * Disconnects from the SSE stream.
   */
  public async disconnect(): Promise<void> {
    if (!this._connected) {
      throw new VError('Transport not connected');
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this._connected = false;
    this.setConnected(false);
  }

  /**
   * Sends a message through the transport.
   * @param message Message to send
   */
  public async send(message: JSONRPCMessage): Promise<void> {
    if (!this._connected) {
      throw new VError('Transport not connected');
    }

    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new VError(`Failed to send message: ${response.statusText}`);
    }
  }

  /**
   * Handles an error that occurred during communication.
   * @param error Error that occurred
   */
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
