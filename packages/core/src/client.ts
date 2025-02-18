import { RequestFailedError, ServerNotInitializedError } from './errors.js';
import type {
  ClientCapabilities,
  InitializeResult,
  JSONRPCError,
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
  LoggingLevel,
  ModelPreferences,
  ProgressToken,
  Prompt,
  PromptMessage,
  SamplingMessage,
  ServerCapabilities,
} from './schema.js';
import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from './schema.js';
import type { McpTransport, MessageHandler } from './transport.js';

/**
 * Client options for initializing a Model Context Protocol client.
 */
export interface McpClientOptions {
  /**
   * Name of the client for identification purposes.
   */
  name: string;
  /**
   * Version of the client.
   */
  version: string;
  /**
   * Request timeout in milliseconds.
   */
  requestTimeout?: number;
  /**
   * Client capabilities.
   */
  capabilities?: ClientCapabilities;
}

/**
 * Pending request data structure.
 */
interface PendingRequest {
  /**
   * Resolve function for the pending request promise.
   */
  resolve: (value: unknown) => void;
  /**
   * Reject function for the pending request promise.
   */
  reject: (reason: unknown) => void;
  /**
   * Timeout for the pending request.
   */
  timeout: NodeJS.Timeout;
}

/**
 * Experimental server capabilities.
 */
interface ExperimentalCapabilities {
  /**
   * Sampling capabilities.
   */
  sampling?: {
    /**
     * Whether the server supports creating messages.
     */
    createMessage: boolean;
  };
  /**
   * Roots capabilities.
   */
  roots?: {
    /**
     * Whether the server supports listing roots.
     */
    listChanged: boolean;
  };
}

/**
 * Server capabilities with experimental features.
 */
interface ServerCapabilitiesWithExperimental extends ServerCapabilities {
  /**
   * Experimental server capabilities.
   */
  experimental?: ExperimentalCapabilities;
}

/**
 * Client implementation of the Model Context Protocol.
 * Provides a high-level interface for interacting with an MCP server.
 */
export class McpClient {
  /**
   * Transport instance for communication.
   */
  private transport: McpTransport | null = null;
  /**
   * Client configuration options.
   */
  private readonly options: McpClientOptions;
  /**
   * Next message ID for JSON-RPC requests.
   */
  private nextMessageId = 1;
  /**
   * Map of pending requests awaiting responses.
   */
  private pendingRequests = new Map<number | string, PendingRequest>();
  /**
   * Set of message handlers.
   */
  private messageHandlers = new Set<MessageHandler>();
  /**
   * Progress handlers for notifications.
   */
  private progressHandlers = new Map<
    ProgressToken,
    (progress: number, total?: number) => void
  >();
  /**
   * Server capabilities received during initialization.
   */
  private serverCapabilities: ServerCapabilitiesWithExperimental | null = null;
  /**
   * Client initialization state.
   */
  private initialized = false;
  /**
   * Authentication token.
   */
  private _authToken?: string;

  /**
   * Creates a new McpClient instance.
   * @param options Client configuration options
   */
  constructor(options: McpClientOptions) {
    this.options = {
      requestTimeout: 30000, // Default 30 second timeout
      capabilities: {},
      ...options,
    };
  }

  /**
   * Connects the client to a transport and initializes the connection.
   * @param transport Transport instance to connect to
   * @returns Promise that resolves when connected and initialized
   * @throws {ServerNotInitializedError} If initialization fails
   */
  async connect(transport: McpTransport): Promise<void> {
    if (this.initialized) {
      throw new ServerNotInitializedError('Client already initialized');
    }

    this.transport = transport;
    await transport.connect();
    transport.onMessage(this.handleMessage);

    // Send initialize message
    const response = (await this.send({
      jsonrpc: JSONRPC_VERSION,
      id: this.nextMessageId++,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: this.options.capabilities || {},
        clientInfo: {
          name: this.options.name,
          version: this.options.version,
        },
      },
    } as JSONRPCRequest)) as InitializeResult;

    if (response.protocolVersion !== LATEST_PROTOCOL_VERSION) {
      throw new RequestFailedError(
        `Protocol version mismatch. Client: ${LATEST_PROTOCOL_VERSION}, Server: ${response.protocolVersion}`
      );
    }

    this.serverCapabilities = response.capabilities;
    this.initialized = true;
  }

  /**
   * Disconnects the client from the transport.
   * @returns Promise that resolves when disconnected
   */
  async disconnect(): Promise<void> {
    if (!this.transport) {
      throw new RequestFailedError('Client not connected');
    }
    await this.transport.disconnect();
    this.transport = null;
    this.initialized = false;
    this.serverCapabilities = null;
  }

  /**
   * Handles an incoming response from the server.
   * @param response JSON-RPC response
   */
  private handleResponse(response: JSONRPCResponse | JSONRPCError): void {
    const request = this.pendingRequests.get(response.id);
    if (!request) {
      return;
    }

    clearTimeout(request.timeout);
    this.pendingRequests.delete(response.id);

    if ('error' in response) {
      request.reject(new RequestFailedError(response.error.message));
    } else {
      request.resolve(response.result);
    }
  }

  /**
   * Handles a progress notification from the server.
   * @param params Progress notification parameters
   */
  private handleProgressNotification(params: {
    progressToken: ProgressToken;
    progress: number;
    total?: number;
  }): void {
    const handler = this.progressHandlers.get(params.progressToken);
    if (handler) {
      handler(params.progress, params.total);
    }
  }

  /**
   * Handles an incoming notification from the server.
   * @param notification JSON-RPC notification
   */
  private handleNotification(notification: JSONRPCNotification): void {
    if (
      notification.method === 'notifications/progress' &&
      'params' in notification
    ) {
      const params = notification.params as {
        progressToken: ProgressToken;
        progress: number;
        total?: number;
      };
      this.handleProgressNotification(params);
    } else if (
      notification.method === 'notifications/cancelled' &&
      notification.params
    ) {
      const { requestId, reason } = notification.params as {
        requestId: string | number;
        reason?: string;
      };
      const pendingRequest = this.pendingRequests.get(requestId);
      if (pendingRequest) {
        clearTimeout(pendingRequest.timeout);
        this.pendingRequests.delete(requestId);
        pendingRequest.reject(
          new RequestFailedError(
            `Request cancelled: ${reason || 'No reason provided'}`
          )
        );
      }
    }

    // Notify all message handlers
    for (const handler of this.messageHandlers) {
      handler(notification);
    }
  }

  /**
   * Handles an error that occurred during communication.
   * @param error Error instance
   */
  private handleError(error: Error): void {
    // Pass error to transport error handlers
    if (this.transport) {
      const errorHandler = (err: Error) => {
        this.transport?.onError(err);
      };
      this.transport.onError(errorHandler);
      errorHandler(error);
      this.transport.offError(errorHandler);
    }
  }

  /**
   * Handles an incoming message from the transport.
   * @param message JSON-RPC message
   */
  private handleMessage = async (message: JSONRPCMessage): Promise<void> => {
    try {
      if ('id' in message) {
        this.handleResponse(message);
      } else if ('method' in message) {
        this.handleNotification(message);
      }

      // Pass to other handlers
      const handlers = Array.from(this.messageHandlers);
      for (const handler of handlers) {
        try {
          await handler(message);
        } catch (error) {
          if (error instanceof Error) {
            this.handleError(error);
          } else {
            this.handleError(new Error(String(error)));
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.handleError(error);
      } else {
        this.handleError(new Error(String(error)));
      }
    }
  };

  /**
   * Sends a request to the server and waits for a response.
   * @param message JSON-RPC request
   * @returns Promise that resolves with the response
   * @throws {RequestFailedError} If request fails or times out
   */
  async send(message: JSONRPCRequest): Promise<unknown> {
    if (!this.transport) {
      throw new RequestFailedError('Client not connected');
    }

    if (message.method !== 'initialize' && !this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(
          new RequestFailedError(
            `Request timed out after ${this.options.requestTimeout}ms`
          )
        );
      }, this.options.requestTimeout);

      this.pendingRequests.set(message.id, {
        resolve,
        reject,
        timeout,
      });
    });

    await this.transport.send(message);
    return promise;
  }

  /**
   * Adds a message handler to the client.
   * @param handler Message handler function
   */
  public onMessage(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  /**
   * Removes a message handler from the client.
   * @param handler Message handler function
   */
  public offMessage(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  /**
   * Adds a progress handler to the client.
   * @param token Progress token
   * @param handler Progress handler function
   */
  public onProgress(
    token: ProgressToken,
    handler: (progress: number, total?: number) => void
  ): void {
    this.progressHandlers.set(token, handler);
  }

  /**
   * Removes a progress handler from the client.
   * @param token Progress token
   */
  public offProgress(token: ProgressToken): void {
    this.progressHandlers.delete(token);
  }

  /**
   * Gets the server capabilities.
   * @returns Server capabilities or null if not initialized
   */
  public getServerCapabilities(): ServerCapabilitiesWithExperimental | null {
    return this.serverCapabilities;
  }

  /**
   * Calls a tool on the server.
   * @param name Tool name
   * @param params Tool parameters
   * @param progressHandler Progress handler function
   * @returns Promise that resolves with the tool result
   * @throws {ServerNotInitializedError} If client is not initialized
   */
  public async callTool(
    name: string,
    params: Record<string, unknown>,
    progressHandler?: (progress: number, total?: number) => void
  ): Promise<unknown> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    const progressToken = progressHandler ? this.nextMessageId++ : undefined;
    if (progressToken && progressHandler) {
      this.onProgress(progressToken, progressHandler);
    }

    try {
      const response = await this.send({
        jsonrpc: JSONRPC_VERSION,
        id: this.nextMessageId++,
        method: name,
        params: {
          ...params,
          _meta: progressToken ? { progressToken } : undefined,
        },
      } as JSONRPCRequest);

      return response;
    } finally {
      if (progressToken) {
        this.offProgress(progressToken);
      }
    }
  }

  /**
   * Lists the tools available on the server.
   * @returns Promise that resolves with an array of tool names
   * @throws {ServerNotInitializedError} If client is not initialized
   */
  public async listTools(): Promise<string[]> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.tools?.listChanged) {
      throw new RequestFailedError('Server does not support tool listing');
    }

    const response = await this.send({
      jsonrpc: JSONRPC_VERSION,
      id: this.nextMessageId++,
      method: 'tools/list',
      params: {},
    } as JSONRPCRequest);

    return (response as { tools: string[] }).tools;
  }

  /**
   * Sets the logging level on the server.
   * @param level Logging level
   * @returns Promise that resolves when the logging level is set
   * @throws {ServerNotInitializedError} If client is not initialized
   */
  public async setLoggingLevel(level: LoggingLevel): Promise<void> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.logging) {
      throw new RequestFailedError('Server does not support logging');
    }

    await this.send({
      jsonrpc: JSONRPC_VERSION,
      id: this.nextMessageId++,
      method: 'logging/setLevel',
      params: { level },
    } as JSONRPCRequest);
  }

  /**
   * Creates a message on the server.
   * @param messages Messages to create
   * @param options Creation options
   * @returns Promise that resolves with the created message
   * @throws {ServerNotInitializedError} If client is not initialized
   */
  public async createMessage(
    messages: SamplingMessage[],
    options?: {
      modelPreferences?: ModelPreferences;
      systemPrompt?: string;
      includeContext?: 'none' | 'thisServer' | 'allServers';
      temperature?: number;
      maxTokens?: number;
      stopSequences?: string[];
      metadata?: Record<string, unknown>;
      progressHandler?: (progress: number, total?: number) => void;
    }
  ): Promise<SamplingMessage> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.experimental?.sampling?.createMessage) {
      throw new RequestFailedError('Server does not support sampling');
    }

    const progressToken = options?.progressHandler
      ? this.nextMessageId++
      : undefined;
    if (progressToken && options?.progressHandler) {
      this.onProgress(progressToken, options.progressHandler);
    }

    try {
      const request = this.prepareRequest('sampling/createMessage', {
        messages,
        modelPreferences: options?.modelPreferences,
        systemPrompt: options?.systemPrompt,
        includeContext: options?.includeContext,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        stopSequences: options?.stopSequences,
        metadata: options?.metadata,
        _meta: progressToken ? { progressToken } : undefined,
      });
      const response = await this.send(request);

      return (response as { message: SamplingMessage }).message;
    } finally {
      if (progressToken) {
        this.offProgress(progressToken);
      }
    }
  }

  /**
   * Subscribes to message created notifications.
   * @param handler Message created handler function
   * @returns Unsubscribe function
   * @throws {ServerNotInitializedError} If client is not initialized
   */
  public onMessageCreated(
    handler: (message: SamplingMessage) => void
  ): () => void {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.experimental?.sampling?.createMessage) {
      throw new RequestFailedError('Server does not support sampling');
    }

    const messageHandler = (message: JSONRPCMessage) => {
      if (
        'method' in message &&
        message.method === 'notifications/messageCreated' &&
        message.params
      ) {
        handler(message.params.message as SamplingMessage);
      }
    };

    this.onMessage(messageHandler);
    return () => this.offMessage(messageHandler);
  }

  /**
   * Prepares a JSON-RPC request.
   * @param method Method name
   * @param params Method parameters
   * @returns Prepared JSON-RPC request
   */
  public prepareRequest(method: string, params?: unknown): JSONRPCRequest {
    const request: JSONRPCRequest = {
      jsonrpc: JSONRPC_VERSION,
      id: this.nextMessageId++,
      method,
      params: params ?? null,
    };

    if (this._authToken) {
      request.params = {
        token: this._authToken,
        ...(typeof request.params === 'object' ? request.params : { data: request.params }),
      };
    }

    return request;
  }

  /**
   * Lists the prompts available on the server.
   * @returns Promise that resolves with an array of prompt names
   * @throws {ServerNotInitializedError} If client is not initialized
   */
  public async listPrompts(): Promise<Prompt[]> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.prompts?.listChanged) {
      throw new RequestFailedError('Server does not support prompts');
    }

    const request = this.prepareRequest('prompts/list', {});
    const response = await this.send(request);
    return (response as { prompts: Prompt[] }).prompts;
  }

  /**
   * Gets a prompt from the server.
   * @param name Prompt name
   * @param args Prompt arguments
   * @returns Promise that resolves with the prompt
   * @throws {ServerNotInitializedError} If client is not initialized
   */
  public async getPrompt(
    name: string,
    args?: Record<string, string>
  ): Promise<{ description: string; messages: PromptMessage[] }> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.prompts?.listChanged) {
      throw new RequestFailedError('Server does not support prompts');
    }

    const request = this.prepareRequest('prompts/get', {
      name,
      arguments: args,
    });
    return (await this.send(request)) as {
      description: string;
      messages: PromptMessage[];
    };
  }

  /**
   * Executes a prompt on the server.
   * @param name Prompt name
   * @param args Prompt arguments
   * @param progressHandler Progress handler function
   * @returns Promise that resolves with the prompt result
   * @throws {ServerNotInitializedError} If client is not initialized
   */
  public async executePrompt(
    name: string,
    args?: Record<string, string>,
    progressHandler?: (progress: number, total?: number) => void
  ): Promise<{ messages: PromptMessage[] }> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.prompts?.listChanged) {
      throw new RequestFailedError('Server does not support prompts');
    }

    const progressToken = progressHandler ? this.nextMessageId++ : undefined;
    if (progressToken && progressHandler) {
      this.onProgress(progressToken, progressHandler);
    }

    try {
      const request = this.prepareRequest('prompts/execute', {
        name,
        arguments: args,
        _meta: progressToken ? { progressToken } : undefined,
      });
      return (await this.send(request)) as { messages: PromptMessage[] };
    } finally {
      if (progressToken) {
        this.offProgress(progressToken);
      }
    }
  }

  /**
   * Lists the resources available on the server.
   * @returns Promise that resolves with an array of resource names
   * @throws {ServerNotInitializedError} If client is not initialized
   */
  public async listResources(): Promise<string[]> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.resources?.listChanged) {
      throw new RequestFailedError('Server does not support resources');
    }

    const request = this.prepareRequest('resources/list', {});
    const response = await this.send(request);
    return (response as { resources: string[] }).resources;
  }

  /**
   * Reads a resource from the server.
   * @param name Resource name
   * @returns Promise that resolves with the resource content
   * @throws {ServerNotInitializedError} If client is not initialized
   */
  public async readResource(name: string): Promise<unknown> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.resources?.listChanged) {
      throw new RequestFailedError('Server does not support resources');
    }

    const request = this.prepareRequest('resources/read', { name });
    const response = await this.send(request);
    return (response as { content: unknown }).content;
  }

  /**
   * Subscribes to resource changes.
   * @param name Resource name
   * @param onChange Change handler function
   * @returns Promise that resolves with an unsubscribe function
   * @throws {ServerNotInitializedError} If client is not initialized
   */
  public async subscribeToResource(
    name: string,
    onChange: (content: unknown) => void
  ): Promise<() => Promise<void>> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.resources?.listChanged) {
      throw new RequestFailedError('Server does not support resources');
    }

    const request = this.prepareRequest('resources/subscribe', { name });
    await this.send(request);

    const messageHandler = (message: JSONRPCMessage) => {
      if (
        'method' in message &&
        message.method === 'notifications/resourceChanged' &&
        message.params?.name === name
      ) {
        onChange(message.params.content);
      }
    };

    this.onMessage(messageHandler);

    return async () => {
      this.offMessage(messageHandler);
      const unsubscribeRequest = this.prepareRequest('resources/unsubscribe', {
        name,
      });
      await this.send(unsubscribeRequest);
    };
  }

  /**
   * Lists the roots available on the server.
   * @returns Promise that resolves with an array of root names
   * @throws {ServerNotInitializedError} If client is not initialized
   */
  public async listRoots(): Promise<string[]> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.experimental?.roots?.listChanged) {
      throw new RequestFailedError('Server does not support roots');
    }

    const request = this.prepareRequest('roots/list', {});
    const response = await this.send(request);
    return (response as { roots: string[] }).roots;
  }

  /**
   * Subscribes to root changes.
   * @param handler Change handler function
   * @returns Unsubscribe function
   * @throws {ServerNotInitializedError} If client is not initialized
   */
  public onRootsChanged(handler: (roots: string[]) => void): () => void {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.experimental?.roots?.listChanged) {
      throw new RequestFailedError('Server does not support roots');
    }

    const messageHandler = (message: JSONRPCMessage) => {
      if (
        'method' in message &&
        message.method === 'notifications/rootsChanged' &&
        message.params
      ) {
        handler(message.params.roots as string[]);
      }
    };

    this.onMessage(messageHandler);
    return () => this.offMessage(messageHandler);
  }

  /**
   * Sets the authentication token.
   * @param token Authentication token
   */
  public setAuthToken(token: string): void {
    this._authToken = token;
  }

  /**
   * Clears the authentication token.
   */
  public clearAuthToken(): void {
    this._authToken = undefined;
  }

  /**
   * Invokes a tool on the server.
   * @param name Tool name
   * @param params Tool parameters
   * @returns Promise that resolves with the tool result
   * @throws {ServerNotInitializedError} If client is not initialized
   */
  public async invokeTool(
    name: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    const request = this.prepareRequest(name, {
      ...params,
      token: this._authToken,
    });
    return await this.send(request);
  }
}
