/**
 * @file client.ts
 * @description Client implementation for the Model Context Protocol.
 * Provides the core client functionality for communicating with model servers.
 */

import { EventEmitter } from 'node:events';
import { VError } from 'verror';
import { InMemoryTransport } from './in-memory.js';
import type { JSONRPCMessage, JSONRPCRequest } from './schema.js';
import { LATEST_PROTOCOL_VERSION, JSONRPC_VERSION } from './schema.js';
import type { McpTransport, MessageHandler } from './transport.js';

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
  requestTimeout?: number;
}

/**
 * Client implementation of the Model Context Protocol.
 */
export class McpClient {
  private readonly transport: McpTransport;
  private readonly capabilities: Record<string, unknown>;
  private readonly events: EventEmitter;
  private readonly name: string;
  private readonly version: string;
  private readonly timeout: number;
  private initialized = false;
  private serverCapabilities: Record<string, unknown> | null = null;

  constructor(options: ClientOptions, transport?: McpTransport) {
    this.transport = transport ?? new InMemoryTransport();
    this.capabilities = options.capabilities ?? {};
    this.name = options.name;
    this.version = options.version;
    this.timeout = options.requestTimeout ?? 30000;
    this.events = new EventEmitter();

    this.transport.onMessage(this.handleMessage.bind(this));
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
  getServerCapabilities(): Record<string, unknown> | null {
    return this.serverCapabilities;
  }

  /**
   * Send a request to the server
   */
  public async request<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this.initialized && method !== 'initialize') {
      throw new VError('Client not initialized');
    }

    const request: JSONRPCRequest = {
      jsonrpc: JSONRPC_VERSION,
      id: Math.random().toString(36).slice(2),
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      try {
        const handler: MessageHandler = (msg: unknown): Promise<void> => {
          if (!this.isJSONRPCMessage(msg)) {
            return Promise.resolve();
          }
          const message = msg as JSONRPCMessage;

          if ('id' in message && message.id === request.id) {
            this.transport.offMessage(handler);

            if ('error' in message) {
              reject(new VError(message.error.message));
              return Promise.resolve();
            }

            if ('result' in message) {
              resolve(message.result as T);
              return Promise.resolve();
            }
          }
          return Promise.resolve();
        };

        this.transport.onMessage(handler);

        // Send the request after setting up the handler
        this.transport.send(request).catch((err) => {
          this.transport.offMessage(handler);
          reject(err);
        });

        // Add timeout
        setTimeout(() => {
          this.transport.offMessage(handler);
          reject(new VError('Request timed out'));
        }, this.timeout);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Send a notification to the server
   */
  public async notify(
    method: string,
    params?: Record<string, unknown>
  ): Promise<void> {
    if (!this.initialized) {
      throw new VError('Client not initialized');
    }

    const request: JSONRPCRequest = {
      jsonrpc: JSONRPC_VERSION,
      id: Math.random().toString(36).slice(2),
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
    try {
      const response = await this.request<{
        protocolVersion: string;
        serverInfo: { name: string; version: string };
        capabilities: Record<string, unknown>;
      }>('initialize', {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        clientInfo: {
          name: this.name,
          version: this.version,
        },
        capabilities: this.capabilities,
      });

      if (response.protocolVersion !== LATEST_PROTOCOL_VERSION) {
        throw new VError(
          `Protocol version mismatch. Server: ${response.protocolVersion}, Client: ${LATEST_PROTOCOL_VERSION}`
        );
      }

      this.serverCapabilities = response.capabilities;
      this.initialized = true;
      await this.notify('notifications/initialized', {});
    } catch (error) {
      throw new VError(error as Error, 'Failed to initialize client');
    }
  }

  /**
   * Handles an incoming message.
   * @param message Incoming message
   */
  private handleMessage(message: unknown): Promise<void> {
    if (!this.isJSONRPCMessage(message)) {
      throw new VError('Invalid message format');
    }

    // Handle the message
    this.events.emit('message', message);

    if ('method' in message) {
      // Handle notifications
      if (message.method === 'notifications/progress' && 'params' in message) {
        const params = message.params;
        if (params && typeof params === 'object' && 'progressToken' in params) {
          const { progressToken, progress, total } = params as {
            progressToken: string;
            progress: number;
            total: number;
          };
          this.events.emit(`progress:${progressToken}`, progress, total);
        }
      }
      // Handle other notifications
      this.events.emit('method', message);
    }
    return Promise.resolve();
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

    let current = this.serverCapabilities;
    for (const part of path.split('.')) {
      if (
        typeof current !== 'object' ||
        current === null ||
        !(part in current)
      ) {
        return false;
      }
      current = current[part] as Record<string, unknown>;
    }

    return true;
  }
}
