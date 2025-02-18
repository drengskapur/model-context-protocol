/**
 * @file sse.ts
 * @description Server-Sent Events transport implementation for the Model Context Protocol.
 * Provides a transport that uses SSE for communication.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  Channel,
  DefaultChannelState,
  DefaultSessionState,
  Session,
} from 'better-sse';
import { createChannel, createSession } from 'better-sse';
import { VError } from 'verror';
import { BaseTransport } from './transport';

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
  private session: Session<DefaultSessionState> | null = null;
  private channel: Channel<DefaultChannelState, DefaultSessionState> | null =
    null;
  private connecting = false;
  private disconnecting = false;

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
    if (this.isConnected()) {
      throw new VError('Transport already connected');
    }

    if (this.connecting) {
      throw new VError('Transport is already connecting');
    }

    this.connecting = true;

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
        this.channel = createChannel();
        this.channel.register(this.session);
      }

      // Handle session close
      this.session.on('close', () => {
        if (!this.disconnecting) {
          this.handleError(new Error('SSE session closed unexpectedly'));
        }
        this.setConnected(false);
      });

      // Handle session errors
      this.session.on('error', (error) => {
        this.handleError(new VError(error, 'SSE session error'));
      });

      this.setConnected(true);
    } catch (error) {
      this.connecting = false;
      throw new VError(error as Error, 'Failed to connect SSE transport');
    }

    this.connecting = false;
  }

  /**
   * Disconnects from the SSE stream.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected()) {
      return;
    }

    if (this.disconnecting) {
      throw new VError('Transport is already disconnecting');
    }

    this.disconnecting = true;

    try {
      this.channel = null;

      if (this.session) {
        // Send a final message to indicate closure
        await this.session.push('close', '');
        // End the response
        this.options.res.end();
        this.session = null;
      }

      this.setConnected(false);
      this.disconnecting = false;
    } catch (error) {
      this.disconnecting = false;
      throw new VError(error as Error, 'Failed to disconnect SSE transport');
    }
  }

  /**
   * Sends a message through the transport.
   * @param message Message to send
   */
  async send(message: unknown): Promise<void> {
    if (!this.isConnected()) {
      throw new VError('Transport not connected');
    }

    try {
      const messageStr = JSON.stringify(message);

      // If we have a channel, broadcast to all clients
      if (this.channel) {
        await this.channel.broadcast('message', messageStr);
      } else if (this.session) {
        // Otherwise send to single client
        await this.session.push('message', messageStr);
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
  getSession(): Session<DefaultSessionState> | null {
    return this.session;
  }

  /**
   * Gets the current channel.
   * @returns The current channel or null if not using channels
   */
  getChannel(): Channel<DefaultChannelState, DefaultSessionState> | null {
    return this.channel;
  }
}
