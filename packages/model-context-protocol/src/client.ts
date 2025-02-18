/**
 * @file client.ts
 * @description Client implementation for the Model Context Protocol.
 * Provides the core client functionality for communicating with model servers.
 */

import { EventEmitter } from 'node:events';
import { VError } from 'verror';
import { InMemoryTransport } from './in-memory.js';
import {
  type ClientCapabilities,
  type InitializeResult,
  type JSONRPCMessage,
  type JSONRPCNotification,
  type JSONRPCRequest,
  JSONRPC_VERSION,
  LATEST_PROTOCOL_VERSION,
  type RequestId,
  type ServerCapabilities,
} from './schema.js';
import type { McpTransport } from './transport.js';

/**
 * Client options for Model Context Protocol.
 */
export interface ClientOptions {
  /**
   * Client name for identification
   */
  name: string;

  /**
   * Client version
   */
  version: string;

  /**
   * Client capabilities
   */
  capabilities?: Record<string, unknown>;

  /**
   * Request timeout in milliseconds
   */
  timeout?: number;
}

/**
 * Client implementation of the Model Context Protocol.
 */
export class McpClient {
  private readonly transport: McpTransport;
  private readonly capabilities: ClientCapabilities;
  private readonly events: EventEmitter;
  private readonly name: string;
  private readonly version: string;
  private readonly timeout: number;
  private initialized = false;
  private serverCapabilities: ServerCapabilities | null = null;
  private _pendingRequests = new Map<
    RequestId,
    {
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
      progressHandler?: (progress: number, total: number) => void;
    }
  >();

  constructor(options: ClientOptions, transport?: McpTransport) {
    this.transport = transport ?? new InMemoryTransport();
    this.capabilities = options.capabilities ?? {};
    this.name = options.name;
    this.version = options.version;
    this.timeout = options.timeout ?? 30000;
    this.events = new EventEmitter();

    // Set up message handler
    this.transport.onMessage(async (message: unknown) => {
      if (!this.isJSONRPCMessage(message)) {
        return;
      }
      try {
        await this.handleMessage(message);
      } catch (error) {
        this.events.emit('error', error);
      }
    });
  }

  /**
   * Connects to the server.
   */
  async connect(): Promise<void> {
    try {
      await this.transport.connect();
      await this.initialize();
    } catch (error) {
      throw new VError(error as Error, 'Failed to connect to server');
    }
  }

  /**
   * Disconnects from the server.
   */
  async disconnect(): Promise<void> {
    try {
      await this.transport.disconnect();
      this.initialized = false;
      this.serverCapabilities = null;
    } catch (error) {
      throw new VError(error as Error, 'Failed to disconnect from server');
    }
  }

  /**
   * Returns whether the client is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Returns the server capabilities.
   */
  getServerCapabilities(): ServerCapabilities | null {
    return this.serverCapabilities;
  }

  /**
   * Send a request to the server
   */
  public async request<T>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this.transport) {
      throw new VError('Transport not initialized');
    }

    if (!this.initialized && method !== 'initialize') {
      throw new VError('Client not initialized');
    }

    const request: JSONRPCRequest = {
      jsonrpc: JSONRPC_VERSION,
      id: Date.now().toString(),
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const pendingRequest = this._pendingRequests.get(request.id);
        if (pendingRequest) {
          this._pendingRequests.delete(request.id);
          reject(
            new VError(
              {
                name: 'RequestTimeoutError',
                info: {
                  method,
                  requestId: request.id,
                  timeout: this.timeout,
                },
              },
              `Request timed out after ${this.timeout}ms`
            )
          );
        }
      }, this.timeout);

      this._pendingRequests.set(request.id, {
        resolve: (value: unknown) => {
          clearTimeout(timeoutId);
          resolve(value as T);
        },
        reject: (error: unknown) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });

      // Send the request after setting up the handler
      this.transport.send(request).catch((err) => {
        this._pendingRequests.delete(request.id);
        reject(err);
      });
    });
  }

  /**
   * Send a notification to the server
   */
  public async notify(
    method: string,
    params?: Record<string, unknown>
  ): Promise<void> {
    if (!this.transport) {
      throw new VError('Transport not initialized');
    }

    const request: JSONRPCNotification = {
      jsonrpc: JSONRPC_VERSION,
      method,
      params,
    };

    await this.transport.send(request);
  }

  /**
   * Subscribes to message events.
   * @param handler Message handler
   */
  onMessage(handler: (message: JSONRPCMessage) => void): void {
    this.events.on('message', handler);
  }

  /**
   * Unsubscribes from message events.
   * @param handler Message handler
   */
  offMessage(handler: (message: JSONRPCMessage) => void): void {
    this.events.off('message', handler);
  }

  /**
   * Subscribes to progress events.
   * @param token Progress token
   * @param handler Progress handler
   */
  onProgress(
    token: string,
    handler: (progress: number, total: number) => void
  ): void {
    this.events.on(`progress:${token}`, handler);
  }

  /**
   * Unsubscribes from progress events.
   * @param token Progress token
   * @param handler Progress handler
   */
  offProgress(
    token: string,
    handler?: (progress: number, total: number) => void
  ): void {
    if (handler) {
      this.events.off(`progress:${token}`, handler);
    } else {
      this.events.removeAllListeners(`progress:${token}`);
    }
  }

  /**
   * Calls a tool on the server.
   * @param name Tool name
   * @param params Tool parameters
   * @param progressHandler Progress handler
   * @returns Promise that resolves with the tool result
   */
  async callTool<T = unknown>(
    name: string,
    params: Record<string, unknown>,
    progressHandler?: (progress: number, total: number) => void
  ): Promise<T> {
    const progressToken = Math.random().toString(36).slice(2);
    if (progressHandler) {
      this.onProgress(progressToken, progressHandler);
    }

    try {
      const result = await this.request<T>('tools/execute', {
        name,
        params,
        _meta: { progressToken },
      });

      return result;
    } finally {
      if (progressHandler) {
        this.offProgress(progressToken);
      }
    }
  }

  /**
   * Lists available tools.
   */
  listTools(): Promise<Array<{ name: string; description: string }>> {
    return this.request('tools/list');
  }

  /**
   * Lists available prompts.
   */
  listPrompts(): Promise<Array<{ name: string; description: string }>> {
    if (!this.hasCapability('prompts')) {
      throw new VError('Server does not support prompts');
    }
    return this.request('prompts/list');
  }

  /**
   * Gets a prompt by name.
   * @param name Prompt name
   */
  getPrompt(name: string): Promise<unknown> {
    if (!this.hasCapability('prompts')) {
      throw new VError('Server does not support prompts');
    }
    return this.request('prompts/get', { name });
  }

  /**
   * Executes a prompt.
   * @param name Prompt name
   * @param args Prompt arguments
   */
  executePrompt(
    name: string,
    args?: Record<string, unknown>
  ): Promise<{ messages: unknown[] }> {
    if (!this.hasCapability('prompts')) {
      throw new VError('Server does not support prompts');
    }
    return this.request('prompts/execute', { name, arguments: args });
  }

  /**
   * Lists available resources.
   */
  listResources(): Promise<string[]> {
    if (!this.hasCapability('resources')) {
      throw new VError('Server does not support resources');
    }
    return this.request('resources/list');
  }

  /**
   * Reads a resource.
   * @param name Resource name
   */
  readResource<T = unknown>(name: string): Promise<T> {
    if (!this.hasCapability('resources')) {
      throw new VError('Server does not support resources');
    }
    return this.request('resources/read', { name });
  }

  /**
   * Subscribes to resource changes.
   * @param name Resource name
   * @param onChange Change handler
   */
  async subscribeToResource(
    name: string,
    onChange: (content: unknown) => void
  ): Promise<void> {
    if (!this.hasCapability('resources')) {
      throw new VError('Server does not support resources');
    }

    await this.request('resources/subscribe', { name });
    this.events.on(`resource:${name}`, onChange);
  }

  /**
   * Sets the logging level.
   * @param level Logging level
   */
  async setLoggingLevel(level: string): Promise<void> {
    if (!this.hasCapability('logging')) {
      throw new VError('Server does not support logging');
    }
    await this.request('logging/setLevel', { level });
  }

  /**
   * Subscribes to message creation events.
   * @param handler Message handler
   */
  onMessageCreated(handler: (message: unknown) => void): () => void {
    this.events.on('messageCreated', handler);
    return () => this.events.off('messageCreated', handler);
  }

  /**
   * Creates a message.
   * @param messages Messages to use as context
   * @param options Message creation options
   * @param progressHandler Progress handler
   */
  async createMessage(
    messages: unknown[],
    options: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    } = {},
    progressHandler?: (progress: number, total: number) => void
  ): Promise<unknown> {
    if (!this.hasCapability('sampling.createMessage')) {
      throw new VError('Server does not support message creation');
    }

    const progressToken = Math.random().toString(36).slice(2);
    if (progressHandler) {
      this.onProgress(progressToken, progressHandler);
    }

    try {
      const result = await this.request<{ message: unknown }>(
        'sampling/createMessage',
        {
          messages,
          systemPrompt: options.systemPrompt,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          _meta: { progressToken },
        }
      );

      return result.message;
    } finally {
      if (progressHandler) {
        this.offProgress(progressToken);
      }
    }
  }

  /**
   * Initializes the client.
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      throw new VError('Client already initialized');
    }

    try {
      const response = await this.request<InitializeResult>('initialize', {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        clientInfo: {
          name: this.name,
          version: this.version,
        },
        capabilities: this.capabilities,
      });

      // Check protocol version before proceeding with initialization
      if (response.protocolVersion !== LATEST_PROTOCOL_VERSION) {
        throw new VError(
          `Protocol version mismatch. Server: ${response.protocolVersion}, Client: ${LATEST_PROTOCOL_VERSION}`
        );
      }

      this.serverCapabilities = response.capabilities;
      this.initialized = true;

      // Send initialized notification
      await this.notify('notifications/initialized', {}).catch(() => {
        // Ignore notification errors during initialization
      });
    } catch (error) {
      // Reset initialization state on error
      this.initialized = false;
      this.serverCapabilities = null;

      if (
        error instanceof VError &&
        error.message.includes('Protocol version mismatch')
      ) {
        throw error; // Re-throw protocol version mismatch errors directly
      }
      throw new VError(error as Error, 'Failed to initialize client');
    }
  }

  /**
   * Handles an incoming message.
   * @param message Incoming message
   */
  private async handleMessage(message: JSONRPCMessage): Promise<void> {
    if (!('id' in message)) {
      // Handle notifications
      if ('method' in message) {
        await this.handleNotification(message);
      }
      return;
    }

    const { id } = message;
    const handler = this._pendingRequests.get(id.toString());
    if (!handler) {
      // No handler found for this message ID
      return;
    }

    this._pendingRequests.delete(id.toString());

    try {
      if ('error' in message) {
        const error = new VError(
          {
            name: message.error.code?.toString() || 'RPCError',
            info: message.error.data || {},
          },
          message.error.message
        );
        handler.reject(error);
      } else if ('result' in message) {
        handler.resolve(message.result);
      } else {
        handler.reject(new VError('Invalid response message'));
      }
    } catch (error) {
      handler.reject(error);
    }
  }

  /**
   * Handle a notification from the server
   * @param notification Notification to handle
   */
  private handleNotification(notification: JSONRPCNotification): void {
    try {
      this.processNotificationMethod(notification);
    } catch (error) {
      if (this.events.listenerCount('error') > 0) {
        this.events.emit(
          'error',
          new VError('Error handling notification', { cause: error })
        );
      }
      throw error;
    }
  }

  /**
   * Process a notification method
   * @param notification Notification to process
   */
  private processNotificationMethod(notification: JSONRPCNotification): void {
    switch (notification.method) {
      case 'notifications/cancelled': {
        const params = notification.params as unknown as CancellationParams;
        if (!params?.requestId) {
          throw new VError(
            'Invalid cancellation notification: missing requestId'
          );
        }
        const pendingRequest = this._pendingRequests.get(params.requestId);
        if (pendingRequest) {
          pendingRequest.reject(
            new VError(
              `Request cancelled: ${params.reason || 'No reason provided'}`
            )
          );
          this._pendingRequests.delete(params.requestId);
        }
        break;
      }
      case 'notifications/progress': {
        const params = notification.params as unknown as ProgressParams;
        if (
          !params?.token ||
          typeof params.progress !== 'number' ||
          typeof params.total !== 'number'
        ) {
          throw new VError(
            'Invalid progress notification: missing required fields'
          );
        }
        this.events.emit(
          `progress:${params.token}`,
          params.progress,
          params.total
        );
        break;
      }
      case 'notifications/resource': {
        const params = notification.params as {
          name: string;
          content: unknown;
        };
        if (!params?.name) {
          throw new VError(
            'Invalid resource notification: missing resource name'
          );
        }
        this.events.emit(`resource:${params.name}`, params.content);
        break;
      }
      case 'notifications/message': {
        const params = notification.params as { message: unknown };
        if (!params?.message) {
          throw new VError(
            'Invalid message notification: missing message content'
          );
        }
        this.events.emit('messageCreated', params.message);
        break;
      }
      default: {
        // Log unknown notification methods but don't throw
        if (this.events.listenerCount('error') > 0) {
          this.events.emit(
            'error',
            new VError(
              `Received unknown notification method: ${notification.method}`
            )
          );
        }
      }
    }
  }

  private isJSONRPCMessage(message: unknown): message is JSONRPCMessage {
    if (typeof message !== 'object' || message === null) {
      return false;
    }

    const msg = message as Record<string, unknown>;
    if (msg.jsonrpc !== JSONRPC_VERSION) {
      return false;
    }

    // Check for request
    if ('method' in msg && 'id' in msg) {
      return typeof msg.method === 'string';
    }

    // Check for notification
    if ('method' in msg && !('id' in msg)) {
      return typeof msg.method === 'string';
    }

    // Check for response or error
    if ('id' in msg) {
      return 'result' in msg || 'error' in msg;
    }

    return false;
  }

  /**
   * Checks if the server has a capability.
   * @param path Capability path (dot-separated)
   */
  private hasCapability(path: string): boolean {
    if (!this.serverCapabilities) {
      return false;
    }

    const parts = path.split('.');
    let current: unknown = this.serverCapabilities;

    for (const part of parts) {
      if (
        typeof current !== 'object' ||
        current === null ||
        !Object.prototype.hasOwnProperty.call(current, part)
      ) {
        return false;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return true;
  }
}

interface CancellationParams {
  requestId: string;
  reason?: string;
}

interface ProgressParams {
  token: string;
  progress: number;
  total?: number;
}
