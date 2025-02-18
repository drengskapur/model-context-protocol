/**
 * @file sse.ts
 * @description Server-Sent Events transport implementation for the Model Context Protocol.
 * Provides a transport that uses SSE for communication.
 */

import { VError } from 'verror';
import { Session, Channel, createSession } from 'better-sse';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { BaseTransport } from './transport';
import type { JSONRPCRequest, JSONRPCResponse } from './schema';

/**
 * Options for SSE transport.
 */
export interface SseTransportOptions {
  /**
   * HTTP request object.
   */
  req: IncomingMessage;

  /**
   * HTTP response object.
   */
  res: ServerResponse;

  /**
   * Channel name for broadcasting.
   * If provided, messages will be broadcast to all clients in the channel.
   */
  channel?: string;

  /**
   * Whether to automatically reconnect.
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Reconnection delay in milliseconds.
   * @default 1000
   */
  reconnectDelay?: number;

  /**
   * Initial retry delay in milliseconds.
   * @default 1000
   */
  retryTimeout?: number;

  /**
   * Custom headers to include.
   */
  headers?: Record<string, string>;
}

/**
 * SSE transport implementation using better-sse.
 */
export class SseTransport extends BaseTransport {
  private readonly options: Required<SseTransportOptions>;
  private session: Session | null = null;
  private channel: Channel | null = null;

  constructor(options: SseTransportOptions) {
    super();
    this.options = {
      req: options.req,
      res: options.res,
      channel: options.channel ?? 'default',
      autoReconnect: options.autoReconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 1000,
      retryTimeout: options.retryTimeout ?? 1000,
      headers: options.headers ?? {},
    };
  }

  /**
   * Connects to the SSE stream.
   */
  async connect(): Promise<void> {
    try {
      // Set custom headers
      for (const [key, value] of Object.entries(this.options.headers)) {
        this.options.res.setHeader(key, value);
      }

      // Create SSE session
      this.session = await createSession(this.options.req, this.options.res);

      // Set retry timeout
      this.session.retry(this.options.retryTimeout);

      // Join channel if specified
      if (this.options.channel) {
        this.channel = new Channel();
        this.channel.register(this.session);
      }

      // Handle session close
      this.session.on('close', () => {
        this.handleError(new Error('SSE session closed'));
        this.setConnected(false);
      });

      this.setConnected(true);
    } catch (error) {
      throw new VError(error as Error, 'Failed to connect SSE transport');
    }
  }

  /**
   * Disconnects from the SSE stream.
   */
  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        // No close method in Channel type, but it exists at runtime
        (this.channel as any).close();
        this.channel = null;
      }
      if (this.session) {
        // No close method in Session type, but it exists at runtime
        (this.session as any).close();
        this.session = null;
      }
      this.setConnected(false);
    } catch (error) {
      throw new VError(error as Error, 'Failed to disconnect SSE transport');
    }
  }

  /**
   * Sends a message through the SSE stream.
   * @param message Message to send
   */
  async send(message: JSONRPCRequest | JSONRPCResponse): Promise<void> {
    if (!this.isConnected()) {
      throw new VError('Transport not connected');
    }

    try {
      // If we have a channel, broadcast to all clients
      if (this.channel) {
        await (this.channel as any).broadcast(
          'message',
          JSON.stringify(message),
          { data: { id: 'id' in message ? message.id : undefined } }
        );
      } else if (this.session) {
        // Otherwise send to single client
        await this.session.push('message', JSON.stringify(message), {
          data: { id: 'id' in message ? message.id : undefined },
        });
      } else {
        throw new Error('No session or channel available');
      }
    } catch (error) {
      throw new VError(error as Error, 'Failed to send message');
    }
  }

  /**
   * Gets the current session.
   * @returns The current session or null if not connected
   */
  getSession(): Session | null {
    return this.session;
  }

  /**
   * Gets the current channel.
   * @returns The current channel or null if not using channels
   */
  getChannel(): Channel | null {
    return this.channel;
  }
}
