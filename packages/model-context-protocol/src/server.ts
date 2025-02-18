/**
 * @file server.ts
 * @description Server implementation for the Model Context Protocol.
 * Provides the core server functionality for handling model requests and responses.

 */

import { EventEmitter } from 'eventemitter3';
import { VError } from 'verror';
import type { Auth } from './auth';
import type { McpTransport } from './transport';
import {
  LATEST_PROTOCOL_VERSION,
  JSONRPC_VERSION,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type JSONRPCNotification,
  type JSONRPCError,
  type Result,
  type Resource,
  type ListResourcesResult,
  type ReadResourceResult,
  type EmptyResult,
  type Prompt,
  type Tool,
  type ServerCapabilities,
  type LoggingLevel,
  type Implementation,
  type InitializeResult,
  type ClientCapabilities,
  type PromptMessage,
} from './schema';
import {
  McpError,
  AuthError,
  InvalidRequestError,
  MethodNotFoundError,
  INTERNAL_ERROR,
} from './errors';

type MethodHandler = (params: unknown) => Promise<unknown>;

/**
 * Server options for Model Context Protocol.
 */
export interface ServerOptions {
  /** Server name */
  name: string;
  /** Server version */
  version: string;
  /** Optional authentication handler */
  auth?: Auth;
  /** Optional server capabilities */
  capabilities?: Record<string, unknown>;
}

/**
 * Server implementation of the Model Context Protocol.
 */
export class McpServer {
  private readonly _events = new EventEmitter();
  private readonly _methods = new Map<string, MethodHandler>();
  private readonly _resources = new Map<string, Resource>();
  private readonly _resourceSubscriptions = new Set<string>();
  private readonly _prompts = new Map<string, Prompt>();
  private readonly _tools = new Map<string, Tool>();
  private _transport: McpTransport | null = null;
  private _loggingLevel: LoggingLevel | null = null;
  private _initialized = false;

  constructor(
    private readonly info: Implementation,
    private readonly serverCapabilities: ServerCapabilities = {},
    private readonly auth?: Auth
  ) {
    // Register built-in methods
    this.registerMethod('initialize', async (params: unknown) => this.handleInitialize(params));
    this.registerMethod('ping', async () => ({}));
    
    if (serverCapabilities.logging) {
      this.registerMethod('logging/setLevel', async (params: unknown) => this.handleSetLoggingLevel(params));
    }
    
    if (serverCapabilities.resources) {
      this.registerMethod('resources/list', async () => this.handleListResources());
      this.registerMethod('resources/read', async (params: unknown) => this.handleReadResource(params));
      this.registerMethod('resources/subscribe', async (params: unknown) => this.handleSubscribeResource(params));
      this.registerMethod('resources/unsubscribe', async (params: unknown) => this.handleUnsubscribeResource(params));
    }
  }

  /**
   * Get server name
   */
  get name(): string {
    return this.info.name;
  }

  /**
   * Get server version
   */
  get version(): string {
    return this.info.version;
  }

  /**
   * Get server capabilities
   */
  get capabilities(): ServerCapabilities {
    return this.serverCapabilities;
  }

  /**
   * Get server initialization status
   */
  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Register a method handler
   */
  public registerMethod(
    name: string,
    handler: (params: unknown) => Promise<unknown>,
    roles?: string[]
  ): void {
    const wrappedHandler = async (params: unknown) => {
      if (roles && this.auth) {
        const { token, ...rest } = params as { token?: string } & Record<string, unknown>;
        if (!token) {
          throw new AuthError('Authentication token required');
        }
        const payload = await this.auth.validateToken(token);
        if (!roles.every(role => payload.roles.includes(role))) {
          throw new AuthError('Insufficient permissions');
        }
        return handler(rest);
      }
      return handler(params);
    };
    if (this._methods.has(name)) {
      throw new InvalidRequestError(`Method already registered: ${name}`);
    }
    this._methods.set(name, wrappedHandler);
  }

  /**
   * Handle incoming messages
   */
  private async handleMessage(message: unknown): Promise<void> {
    try {
      if (typeof message !== 'object' || message === null || !('jsonrpc' in message)) {
        throw new InvalidRequestError('Invalid message format');
      }

      const msg = message as JSONRPCRequest;
      if (!msg.method) {
        throw new InvalidRequestError('Missing method');
      }

      const handler = this._methods.get(msg.method);
      if (!handler) {
        throw new MethodNotFoundError(`Method not found: ${msg.method}`);
      }

      const result = await handler(msg.params);
      if ('id' in msg) {
        void this._transport?.send({
          jsonrpc: JSONRPC_VERSION,
          id: msg.id,
          result: result as Result,
        } satisfies JSONRPCResponse);
      }
    } catch (error) {
      if (typeof message === 'object' && message !== null && 'id' in message) {
        const errorResponse: JSONRPCError = {
          jsonrpc: JSONRPC_VERSION,
          id: (message as { id: string | number }).id,
          error: {
            code: error instanceof McpError ? error.code : INTERNAL_ERROR,
            message: error instanceof Error ? error.message : String(error),
            data: error instanceof McpError ? error.data : undefined,
          },
        };
        void this._transport?.send(errorResponse);
      }
    }
  }

  /**
   * Connect to a transport
   */
  public async connect(transport: McpTransport): Promise<void> {
    this._transport = transport;
    transport.onMessage(this.handleMessage.bind(this));
    await transport.connect();
  }

  private async handleInitialize(params: unknown): Promise<InitializeResult> {
    if (this._initialized) {
      throw new VError('Server already initialized');
    }

    const { protocolVersion, capabilities: clientCapabilities } = params as {
      protocolVersion: string;
      capabilities: ClientCapabilities;
    };

    if (protocolVersion !== LATEST_PROTOCOL_VERSION) {
      throw new VError(
        'Protocol version mismatch. Server: %s, Client: %s',
        LATEST_PROTOCOL_VERSION,
        protocolVersion
      );
    }

    this._initialized = true;

    return {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      serverInfo: this.info,
      capabilities: this.capabilities,
    };
  }

  private async handleSetLoggingLevel(params: unknown): Promise<EmptyResult> {
    const { level } = params as { level: LoggingLevel };
    this._loggingLevel = level;
    return {};
  }

  private async handleListResources(): Promise<ListResourcesResult> {
    return {
      resources: Array.from(this._resources.values()),
    };
  }

  private async handleReadResource(params: unknown): Promise<ReadResourceResult> {
    const { uri } = params as { uri: string };
    const resource = this._resources.get(uri);
    if (!resource) {
      throw new VError('Resource not found: ' + uri);
    }
    return {
      contents: [{
        uri: resource.uri,
        mimeType: resource.mimeType ?? 'application/json',
        text: JSON.stringify(resource),
      }],
    };
  }

  private async handleSubscribeResource(params: unknown): Promise<EmptyResult> {
    const { uri } = params as { uri: string };
    if (!this._resources.has(uri)) {
      throw new VError('Resource not found: ' + uri);
    }
    this._resourceSubscriptions.add(uri);
    return {};
  }

  private async handleUnsubscribeResource(params: unknown): Promise<EmptyResult> {
    const { uri } = params as { uri: string };
    if (!this._resources.has(uri)) {
      throw new VError('Resource not found: ' + uri);
    }
    this._resourceSubscriptions.delete(uri);
    return {};
  }

  /**
   * Register a tool
   */
  public registerTool(tool: Tool): void {
    if (this._tools.has(tool.name)) {
      throw new VError('Tool already registered: %s', tool.name);
    }
    this._tools.set(tool.name, tool);
  }

  /**
   * Register a prompt
   */
  public registerPrompt(prompt: Prompt): void {
    if (this._prompts.has(prompt.name)) {
      throw new VError('Prompt already registered: %s', prompt.name);
    }
    this._prompts.set(prompt.name, prompt);
  }

  /**
   * Send a notification to all connected clients
   */
  private async sendNotification(method: string, params: Record<string, unknown>): Promise<void> {
    if (!this._transport) {
      return;
    }
    await this._transport.send({
      jsonrpc: JSONRPC_VERSION,
      method,
      params,
    } satisfies JSONRPCNotification);
  }

  /**
   * Send a prompt message to all connected clients
   */
  public async sendPrompt(message: PromptMessage): Promise<void> {
    await this.sendNotification('prompt', { message });
  }

  /**
   * Update a resource and notify subscribers
   */
  public async updateResource(resource: Resource): Promise<void> {
    this._resources.set(resource.uri, resource);
    if (this._resourceSubscriptions.has(resource.uri)) {
      await this.sendNotification('resource/updated', { resource });
    }
  }

  public async sendLogMessage(level: LoggingLevel, data: unknown): Promise<void> {
    if (!this._transport || !this._loggingLevel) return;

    const levels: LoggingLevel[] = [
      'debug',
      'info',
      'notice',
      'warning',
      'error',
      'critical',
      'alert',
      'emergency',
    ];

    const currentLevelIndex = levels.indexOf(this._loggingLevel);
    const messageLevelIndex = levels.indexOf(level);

    if (messageLevelIndex >= currentLevelIndex) {
      void this._transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/message',
        params: {
          level,
          data,
        },
      } satisfies JSONRPCNotification);
    }
  }

  public prompt(prompt: Prompt): void {
    this._prompts.set(prompt.name, prompt);
  }

  public tool(name: string, schema: unknown, handler: (params: unknown) => Promise<unknown>): void {
    const tool: Tool = {
      name,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    };
    this._tools.set(name, tool);
    this.registerMethod(`tools/call/${name}`, handler);
  }

  public resource(resource: Resource): void {
    this._resources.set(resource.uri, resource);
    
    if (this._transport && this.capabilities.resources?.listChanged) {
      void this._transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/resources/list_changed',
      } satisfies JSONRPCNotification);
    }

    if (this._resourceSubscriptions.has(resource.uri)) {
      void this._transport?.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/resources/updated',
        params: {
          uri: resource.uri,
        },
      } satisfies JSONRPCNotification);
    }
  }

  public async disconnect(): Promise<void> {
    if (this._transport) {
      void this._transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'disconnect',
      } satisfies JSONRPCNotification);
      await this._transport.disconnect();
      this._transport = null;
    }
  }
}
