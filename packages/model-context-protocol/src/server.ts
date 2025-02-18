/**
 * @file server.ts
 * @description Server implementation for the Model Context Protocol.
 * Provides the core server functionality for handling model requests and responses.
 */

import { EventEmitter } from 'eventemitter3';
import { VError } from 'verror';
import type { Auth } from './auth';
import {
  AuthError,
  INTERNAL_ERROR,
  InvalidRequestError,
  McpError,
  MethodNotFoundError,
} from './errors';
import {
  type ClientCapabilities,
  type EmptyResult,
  type Implementation,
  type InitializeResult,
  type JSONRPCError,
  type JSONRPCNotification,
  type JSONRPCRequest,
  type JSONRPCResponse,
  JSONRPC_VERSION,
  LATEST_PROTOCOL_VERSION,
  type LoggingLevel,
  type Prompt,
  type PromptMessage,
  type ReadResourceResult,
  type Resource,
  type Result,
  SUPPORTED_PROTOCOL_VERSIONS,
  type ServerCapabilities,
  type Tool,
} from './schema';
import type { McpTransport } from './transport';

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
  loggingLevel?: LoggingLevel;
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
  private readonly implementation: Implementation;
  private readonly serverCapabilities: ServerCapabilities;
  private readonly auth?: Auth;

  constructor(
    implementation: Implementation,
    serverCapabilities: ServerCapabilities = {},
    auth?: Auth
  ) {
    this.implementation = implementation;
    this.serverCapabilities = serverCapabilities;
    this.auth = auth;

    // Register built-in methods
    this.registerMethod('initialize', (params: unknown) =>
      this.handleInitialize(params)
    );
    this.registerMethod('ping', async () => ({}));

    if (serverCapabilities.logging) {
      this.registerMethod(
        'logging/setLevel',
        async (params: unknown) => await this.handleSetLoggingLevel(params)
      );
    }

    if (serverCapabilities.resources) {
      this.registerMethod('resources/list', async () =>
        this.handleListResources()
      );
      this.registerMethod('resources/read', async (params: unknown) =>
        this.handleReadResource(params)
      );
      this.registerMethod(
        'resources/subscribe',
        async (params: unknown) => await this.handleSubscribeResource(params)
      );
      this.registerMethod(
        'resources/unsubscribe',
        async (params: unknown) => await this.handleUnsubscribeResource(params)
      );
    }
  }

  /**
   * Get server name
   */
  get name(): string {
    return this.implementation.name;
  }

  /**
   * Get server version
   */
  get version(): string {
    return this.implementation.version;
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
  registerMethod(
    name: string,
    handler: (params: unknown) => Promise<unknown>,
    roles?: string[]
  ): void {
    const wrappedHandler = async (params: unknown) => {
      if (roles && this.auth) {
        const { token, ...rest } = params as { token?: string } & Record<
          string,
          unknown
        >;
        if (!token) {
          throw new AuthError('Authentication token required');
        }
        const payload = await this.auth.validateToken(token);
        if (!roles.every((role) => payload.roles.includes(role))) {
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
   * Validate message format
   */
  private validateMessage(message: unknown): JSONRPCRequest {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('jsonrpc' in message)
    ) {
      throw new InvalidRequestError('Invalid message format');
    }

    const msg = message as JSONRPCRequest;
    if (!msg.method) {
      throw new InvalidRequestError('Missing method');
    }

    return msg;
  }

  /**
   * Get method handler
   */
  private getMethodHandler(method: string): MethodHandler {
    const handler = this._methods.get(method);
    if (!handler) {
      throw new MethodNotFoundError(`Method not found: ${method}`);
    }
    return handler;
  }

  /**
   * Send success response
   */
  private sendSuccessResponse(
    id: string | number | null,
    result: unknown
  ): Promise<void> {
    if (id === null) {
      return Promise.resolve();
    }
    return (
      this._transport?.send({
        jsonrpc: JSONRPC_VERSION,
        id,
        result: result as Result,
      } satisfies JSONRPCResponse) ?? Promise.resolve()
    );
  }

  /**
   * Send error response
   */
  private sendErrorResponse(
    id: string | number | null,
    error: unknown
  ): Promise<void> {
    if (id === null) {
      return Promise.resolve();
    }
    const errorResponse: JSONRPCError = {
      jsonrpc: JSONRPC_VERSION,
      id,
      error: {
        code: error instanceof McpError ? error.code : INTERNAL_ERROR,
        message: error instanceof Error ? error.message : String(error),
        data: error instanceof McpError ? error.data : undefined,
      },
    };
    return this._transport?.send(errorResponse) ?? Promise.resolve();
  }

  /**
   * Handle incoming messages
   */
  private async handleMessage(message: unknown): Promise<void> {
    try {
      const request = this.validateMessage(message);
      const handler = this.getMethodHandler(request.method);
      const result = await handler(request.params);
      await this.sendSuccessResponse(request.id ?? null, result);
    } catch (error) {
      const id =
        typeof message === 'object' && message !== null && 'id' in message
          ? ((message as { id?: string | number | null }).id ?? null)
          : null;
      await this.sendErrorResponse(id, error);
    }
  }

  /**
   * Connect to a transport
   */
  async connect(transport: McpTransport): Promise<void> {
    this._transport = transport;
    transport.onMessage(this.handleMessage.bind(this));
    await transport.connect();
  }

  private handleInitialize(params: unknown): Promise<InitializeResult> {
    if (!this._transport) {
      throw new VError('Transport not initialized');
    }

    // Validate params
    const { protocolVersion } = params as {
      protocolVersion: string;
      clientInfo: { name: string; version: string };
      capabilities: ClientCapabilities;
    };

    // Check protocol version compatibility
    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion)) {
      throw new VError(
        `Unsupported protocol version: ${protocolVersion}. Server supports: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}`
      );
    }

    this._initialized = true;

    return Promise.resolve({
      protocolVersion: LATEST_PROTOCOL_VERSION,
      serverInfo: {
        name: this.implementation.name,
        version: this.implementation.version,
      },
      capabilities: this.serverCapabilities,
    });
  }

  private handleSetLoggingLevel(params: unknown): Promise<EmptyResult> {
    const { level } = params as { level: LoggingLevel };
    this._loggingLevel = level;
    return Promise.resolve({});
  }

  private handleListResources(): Promise<ListResourcesResult> {
    if (!this.serverCapabilities.resources) {
      return Promise.reject(new Error('Resources not supported'));
    }

    return Promise.resolve({
      resources: {
        subscribe: true,
        listChanged: false,
      },
    });
  }

  private handleReadResource(params: unknown): Promise<ReadResourceResult> {
    if (!this.serverCapabilities.resources) {
      return Promise.reject(new Error('Resources not supported'));
    }

    const readResourceParams = parseReadResourceParams(params);
    if (!readResourceParams) {
      return Promise.reject(new Error('Invalid read resource params'));
    }

    const resource = this.serverCapabilities.resources.find(
      (r) => r.uri === readResourceParams.uri
    );
    if (!resource) {
      return Promise.reject(new Error('Resource not found'));
    }

    return Promise.resolve({
      resource,
      contents: '',
    });
  }

  private handleSubscribeResource(params: unknown): Promise<EmptyResult> {
    const { name } = params as { name: string };
    if (!this._resources.has(name)) {
      throw new VError(`Resource not found: ${name}`);
    }
    this._resourceSubscriptions.add(name);
    return Promise.resolve({});
  }

  private handleUnsubscribeResource(params: unknown): Promise<EmptyResult> {
    const { name } = params as { name: string };
    this._resourceSubscriptions.delete(name);
    return Promise.resolve({});
  }

  /**
   * Send a notification to all connected clients
   */
  private async sendNotification(
    method: string,
    params?: { [key: string]: unknown; _meta?: { [key: string]: unknown } }
  ): Promise<void> {
    if (!this._transport) {
      return;
    }
    const notification: JSONRPCNotification = {
      jsonrpc: JSONRPC_VERSION,
      method,
      params,
    };
    await this._transport.send(notification);
  }

  /**
   * Send a progress notification
   */
  private async sendProgress(
    token: string,
    progress: number,
    total: number
  ): Promise<void> {
    await this.sendNotification('notifications/progress', {
      token,
      progress,
      total,
    });
  }

  /**
   * Send a cancellation notification
   */
  private async sendCancellation(requestId: string): Promise<void> {
    await this.sendNotification('notifications/cancelled', { requestId });
  }

  /**
   * Send a resource change notification
   */
  private async sendResourceChange(
    name: string,
    content: unknown
  ): Promise<void> {
    if (this._resourceSubscriptions.has(name)) {
      await this.sendNotification('notifications/resource', { name, content });
    }
  }

  /**
   * Register a tool
   */
  registerTool(tool: Tool): void {
    if (this._tools.has(tool.name)) {
      throw new VError(`Tool already registered: ${tool.name}`);
    }
    this._tools.set(tool.name, tool);
  }

  /**
   * Register a prompt
   */
  registerPrompt(prompt: Prompt): void {
    if (this._prompts.has(prompt.name)) {
      throw new VError(`Prompt already registered: ${prompt.name}`);
    }
    this._prompts.set(prompt.name, prompt);
  }

  /**
   * Send a prompt message to all connected clients
   */
  async sendPrompt(message: PromptMessage): Promise<void> {
    await this.sendNotification('prompt', { message });
  }

  /**
   * Update a resource and notify subscribers
   */
  async updateResource(resource: Resource): Promise<void> {
    this._resources.set(resource.uri, resource);
    if (this._resourceSubscriptions.has(resource.uri)) {
      await this.sendNotification('resource/updated', { resource });
    }
  }

  sendLogMessage(
    level: LoggingLevel,
    message: string,
    details?: Record<string, unknown>
  ): void {
    if (!this._transport) {
      return;
    }

    const currentLevelIndex = this.loggingLevelIndex;
    if (currentLevelIndex === -1) {
      return;
    }

    const messageLevelIndex = this.getLoggingLevelIndex(level);
    if (messageLevelIndex === -1) {
      return;
    }

    if (messageLevelIndex >= currentLevelIndex) {
      this._transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'logging/message',
        params: {
          level,
          message,
          details,
        },
      } satisfies JSONRPCNotification);
    }
  }

  prompt(prompt: Prompt): void {
    this._prompts.set(prompt.name, prompt);
  }

  tool(
    name: string,
    _schema: unknown,
    handler: (params: unknown) => Promise<unknown>
  ): void {
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

  resource(resource: Resource): void {
    this._resources.set(resource.uri, resource);

    if (this._transport && this.capabilities.resources?.listChanged) {
      this._transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/resources/list_changed',
      } satisfies JSONRPCNotification);
    }

    if (this._resourceSubscriptions.has(resource.uri)) {
      this._transport?.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/resources/updated',
        params: {
          uri: resource.uri,
        },
      } satisfies JSONRPCNotification);
    }
  }

  async disconnect(): Promise<void> {
    if (this._transport) {
      await this._transport.disconnect();
      this._transport = null;
    }
    // Reset server state
    this._initialized = false;
    this._loggingLevel = null;
    this._resourceSubscriptions.clear();
  }

  async readResource(
    id: string,
    _options: {
      subscribe?: boolean;
      listChanged?: boolean;
      find?: boolean;
    } = {}
  ): Promise<{ resource: Resource; contents: string }> {
    const resource = this._resources.get(id);
    if (!resource) {
      throw new VError(`Resource ${id} not found`);
    }

    try {
      const contents = await resource.read();
      return {
        resource,
        contents,
      };
    } catch (error) {
      throw new VError(
        error instanceof Error ? error : String(error),
        `Failed to read resource ${id}`
      );
    }
  }

  getLoggingLevel(): LoggingLevel {
    return this._loggingLevel ?? 'Info';
  }
}

export interface ReadResourceResult {
  resource: Resource;
  contents: string;
}

export interface ListResourcesResult {
  resources: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
}

function parseReadResourceParams(params: unknown): { uri: string } | null {
  if (!params || typeof params !== 'object' || !('uri' in params)) {
    return null;
  }

  const uri = params.uri;
  if (typeof uri !== 'string') {
    return null;
  }

  return { uri };
}
