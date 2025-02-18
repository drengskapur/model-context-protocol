/**
 * @file client.ts
 * @description Client implementation for the Model Context Protocol.
 * Provides functionality for connecting to and communicating with MCP servers.
 */

import { EventEmitter } from 'node:events';
import { VError } from 'verror';
import type {
  JSONRPCError,
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
  Result,
  SamplingMessage,
} from './schema.js';
import { BaseTransport } from './base.js';

/**
 * Client options for Model Context Protocol.
 */
export interface ClientOptions {
  /**
   * Transport to use for communication.
   */
  transport: BaseTransport;

  /**
   * Client name for identification
   */
  name?: string;

  /**
   * Client version
   */
  version?: string;

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
  private readonly transport: BaseTransport;
  private readonly capabilities: Record<string, unknown>;
  private readonly events: EventEmitter;
  private readonly name: string;
  private readonly version: string;
  private readonly timeout: number;
  private initialized = false;
  private serverCapabilities: Record<string, unknown> | null = null;

  constructor(options: ClientOptions) {
    this.transport = options.transport;
    this.capabilities = options.capabilities ?? {};
    this.name = options.name ?? 'model-context-protocol';
    this.version = options.version ?? '0.1.0';
    this.timeout = options.timeout ?? 30000;
    this.events = new EventEmitter();

    this.transport.on('message', this.handleMessage.bind(this));
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
   * Sends a request to the server.
   * @param method Method name
   * @param params Method parameters
   * @returns Promise that resolves with the response
   */
  async request<T>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this.initialized && method !== 'initialize') {
      throw new VError('Client not initialized');
    }

    try {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: Math.random().toString(36).slice(2),
        method,
        params,
      };

      return new Promise<T>((resolve, reject) => {
        const handler = (message: JSONRPCMessage) => {
          if ('id' in message && message.id === request.id) {
            this.transport.off('message', handler);

            if ('error' in message) {
              reject(new VError(message.error.message));
            } else if ('result' in message) {
              resolve(message.result as T);
            }
          }
        };

        this.transport.on('message', handler);

        // Send the request after setting up the handler
        this.transport.send(request).catch(reject);

        // Add timeout
        setTimeout(() => {
          this.transport.off('message', handler);
          reject(new VError('Request timed out'));
        }, this.timeout);
      });
    } catch (error) {
      throw new VError(error as Error, `Failed to execute request: ${method}`);
    }
  }

  /**
   * Sends a notification to the server.
   * @param method Method name
   * @param params Method parameters
   */
  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    if (!this.initialized) {
      throw new VError('Client not initialized');
    }

    try {
      const notification: JSONRPCNotification = {
        jsonrpc: '2.0',
        method,
        params,
      };
      await this.transport.send(notification);
    } catch (error) {
      throw new VError(error as Error, `Failed to send notification: ${method}`);
    }
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
  async listTools(): Promise<Array<{ name: string; description: string }>> {
    return this.request('tools/list');
  }

  /**
   * Lists available prompts.
   */
  async listPrompts(): Promise<Array<{ name: string; description: string }>> {
    if (!this.hasCapability('prompts')) {
      throw new VError('Server does not support prompts');
    }
    return this.request('prompts/list');
  }

  /**
   * Gets a prompt by name.
   * @param name Prompt name
   */
  async getPrompt(name: string): Promise<unknown> {
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
  async executePrompt(
    name: string,
    args?: Record<string, unknown>
  ): Promise<{ messages: SamplingMessage[] }> {
    if (!this.hasCapability('prompts')) {
      throw new VError('Server does not support prompts');
    }
    return this.request('prompts/execute', { name, arguments: args });
  }

  /**
   * Lists available resources.
   */
  async listResources(): Promise<string[]> {
    if (!this.hasCapability('resources')) {
      throw new VError('Server does not support resources');
    }
    return this.request('resources/list');
  }

  /**
   * Reads a resource.
   * @param name Resource name
   */
  async readResource<T = unknown>(name: string): Promise<T> {
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
  onMessageCreated(handler: (message: SamplingMessage) => void): () => void {
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
    messages: SamplingMessage[],
    options: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    } = {},
    progressHandler?: (progress: number, total: number) => void
  ): Promise<SamplingMessage> {
    if (!this.hasCapability('sampling.createMessage')) {
      throw new VError('Server does not support message creation');
    }

    const progressToken = Math.random().toString(36).slice(2);
    if (progressHandler) {
      this.onProgress(progressToken, progressHandler);
    }

    try {
      const result = await this.request<{ message: SamplingMessage }>(
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
        protocolVersion: '2024-02-18',
        clientInfo: {
          name: this.name,
          version: this.version,
        },
        capabilities: this.capabilities,
      });

      if (response.protocolVersion !== '2024-02-18') {
        throw new VError(
          `Protocol version mismatch. Server: ${response.protocolVersion}, Client: 2024-02-18`
        );
      }

      this.serverCapabilities = response.capabilities;
      this.initialized = true;
      await this.notify('notifications/initialized');
    } catch (error) {
      throw new VError(error as Error, 'Failed to initialize client');
    }
  }

  /**
   * Handles an incoming message.
   * @param message Incoming message
   */
  private async handleMessage(message: JSONRPCMessage): Promise<void> {
    try {
      // Emit the raw message first
      this.events.emit('message', message);

      // Handle notifications
      if ('method' in message) {
        const notification = message as JSONRPCNotification;
        
        if (notification.method === 'notifications/progress') {
          const { progressToken, progress, total } = notification.params as {
            progressToken: string;
            progress: number;
            total: number;
          };
          this.events.emit(`progress:${progressToken}`, progress, total);
        } else if (notification.method === 'notifications/messageCreated') {
          const { message: samplingMessage } = notification.params as {
            message: SamplingMessage;
          };
          this.events.emit('messageCreated', samplingMessage);
        } else if (notification.method === 'notifications/resourceChanged') {
          const { name, content } = notification.params as {
            name: string;
            content: unknown;
          };
          this.events.emit(`resource:${name}`, content);
        }
      }
    } catch (error) {
      this.events.emit('error', new VError(error as Error, 'Failed to handle message'));
    }
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
      if (typeof current !== 'object' || current === null || !(part in current)) {
        return false;
      }
      current = current[part] as Record<string, unknown>;
    }

    return true;
  }
}
