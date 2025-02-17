import type { McpTransport, MessageHandler } from '../transport.js';
import type { JSONRPCMessage } from '../schema.js';
import { parse } from 'valibot';
import { jsonRpcMessageSchema } from '../schemas.js';

interface SseTransportOptions {
  /**
   * The URL to connect to for SSE events
   */
  eventSourceUrl: string;

  /**
   * The URL to send messages to
   */
  sendUrl: string;

  /**
   * Optional headers to include in the EventSource connection
   */
  eventSourceHeaders?: Record<string, string>;

  /**
   * Optional headers to include in send requests
   */
  sendHeaders?: Record<string, string>;

  /**
   * Optional fetch implementation to use for sending messages
   * Defaults to global fetch
   */
  fetch?: typeof fetch;

  /**
   * Optional EventSource implementation to use
   * Defaults to global EventSource
   */
  EventSource?: typeof EventSource;
}

/**
 * Transport implementation that uses Server-Sent Events (SSE) for receiving messages
 * and HTTP POST for sending messages.
 */
export class SseTransport implements McpTransport {
  private _started = false;
  private _messageHandlers = new Set<MessageHandler>();
  private _errorHandlers = new Set<(error: Error) => void>();
  private _eventSource: EventSource | null = null;
  private readonly _options: Required<Pick<SseTransportOptions, 'eventSourceUrl' | 'sendUrl' | 'eventSourceHeaders' | 'sendHeaders'>> & {
    fetch: typeof fetch;
    EventSource: typeof EventSource;
  };

  constructor(options: SseTransportOptions) {
    this._options = {
      eventSourceUrl: options.eventSourceUrl,
      sendUrl: options.sendUrl,
      eventSourceHeaders: options.eventSourceHeaders ?? {},
      sendHeaders: options.sendHeaders ?? {},
      fetch: options.fetch ?? globalThis.fetch,
      EventSource: options.EventSource ?? globalThis.EventSource,
    };
  }

  private _handleError(error: Error): void {
    if (this._errorHandlers.size > 0) {
      for (const handler of this._errorHandlers) {
        handler(error);
      }
    }
  }

  private _onMessage = (event: MessageEvent) => {
    try {
      const data = event.data;
      if (typeof data !== 'string') {
        throw new Error('Invalid message data type');
      }

      try {
        const message = JSON.parse(data);
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
    } catch (error) {
      this._handleError(
        new Error(
          `Error handling message: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  };

  private _onError = (event: Event) => {
    this._handleError(new Error(`SSE error: ${(event as ErrorEvent).message}`));
  };

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
        'SseTransport already connected! Call close() before connecting again.'
      );
    }

    return new Promise((resolve, reject) => {
      try {
        // Build URL with headers as query parameters since EventSource doesn't support headers directly
        const url = new URL(this._options.eventSourceUrl);
        Object.entries(this._options.eventSourceHeaders).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });

        this._eventSource = new this._options.EventSource(url.toString(), {
          withCredentials: true,
        });

        this._eventSource.onmessage = this._onMessage;
        this._eventSource.onerror = this._onError;
        this._eventSource.onopen = () => {
          this._started = true;
          resolve();
        };
      } catch (error) {
        reject(new Error(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
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

    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }

    return Promise.resolve();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._started) {
      throw new Error('SseTransport not connected!');
    }

    // Validate message against schema before sending
    const validatedMessage = parse(jsonRpcMessageSchema, message);
    const serialized = JSON.stringify(validatedMessage) + '\n';

    const response = await this._options.fetch(this._options.sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this._options.sendHeaders,
      },
      body: serialized,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.status} ${response.statusText}`);
    }
  }

  public onMessage(handler: MessageHandler): void {
    this._messageHandlers.add(handler);
  }

  public offMessage(handler: MessageHandler): void {
    this._messageHandlers.delete(handler);
  }
}
