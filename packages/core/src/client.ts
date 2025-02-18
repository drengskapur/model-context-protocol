import {
  McpError,
  RequestFailedError,
  ServerNotInitializedError,
} from './errors.js';
import type {
  ClientCapabilities,
  InitializeResult,
  JSONRPCError,
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
  LoggingLevel,
  ProgressToken,
  ServerCapabilities,
  SamplingMessage,
  ModelPreferences,
  Prompt,
  PromptMessage,
} from './schema.js';
import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from './schema.js';
import type { McpTransport } from './transport.js';
import type { MessageHandler } from './transport.js';

export interface McpClientOptions {
  name: string;
  version: string;
  requestTimeout?: number;
  capabilities?: ClientCapabilities;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: NodeJS.Timeout;
}

export class McpClient {
  private transport: McpTransport | null = null;
  private readonly options: McpClientOptions;
  private nextMessageId = 1;
  private messageHandlers = new Set<MessageHandler>();
  private pendingRequests = new Map<number | string, PendingRequest>();
  private progressHandlers = new Map<
    ProgressToken,
    (progress: number, total?: number) => void
  >();
  private serverCapabilities: ServerCapabilities | null = null;
  private initialized = false;
  private _authToken?: string;

  constructor(options: McpClientOptions) {
    this.options = {
      requestTimeout: 30000, // Default 30 second timeout
      capabilities: {},
      ...options,
    };
  }

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

  async disconnect(): Promise<void> {
    if (!this.transport) {
      throw new RequestFailedError('Client not connected');
    }
    await this.transport.disconnect();
    this.transport = null;
    this.initialized = false;
    this.serverCapabilities = null;
  }

  private handleResponse(response: JSONRPCResponse | JSONRPCError): void {
    const id = response.id;
    const pendingRequest = this.pendingRequests.get(id);
    if (!pendingRequest) {
      return;
    }

    clearTimeout(pendingRequest.timeout);
    this.pendingRequests.delete(id);

    if ('error' in response) {
      pendingRequest.reject(McpError.fromJSON(response.error));
    } else {
      pendingRequest.resolve(response.result);
    }
  }

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

  private handleError(error: Error): void {
    // Pass error to transport error handlers
    if (this.transport) {
      const errorHandler = (err: Error) => {
        // Handle the error
        console.error('Error in message handler:', err);
      };
      this.transport.onError(errorHandler);
      errorHandler(error);
      this.transport.offError(errorHandler); // Clean up the handler after use
    }
  }

  private handleMessage = async (message: JSONRPCMessage): Promise<void> => {
    try {
      // Handle responses
      if ('id' in message && message.id !== null) {
        this.handleResponse(message as JSONRPCResponse | JSONRPCError);
      }

      // Handle notifications
      if ('method' in message && !('id' in message)) {
        const notification = message as JSONRPCNotification;
        if (
          notification.method === 'notifications/progress' &&
          notification.params
        ) {
          this.handleProgressNotification(
            notification.params as {
              progressToken: ProgressToken;
              progress: number;
              total?: number;
            }
          );
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
      }

      // Pass to other handlers
      const handlers = Array.from(this.messageHandlers);
      for (const handler of handlers) {
        try {
          await handler(message);
        } catch (error) {
          // Log error but continue with other handlers
          if (error instanceof Error) {
            this.handleError(error);
          } else {
            this.handleError(new Error(String(error)));
          }
        }
      }
    } catch (error) {
      // Log error but don't throw to avoid crashing the message handling loop
      if (error instanceof Error) {
        this.handleError(error);
      } else {
        this.handleError(new Error(String(error)));
      }
    }
  };

  async send(message: JSONRPCRequest): Promise<unknown> {
    const transport = this.transport;
    if (!transport) {
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

    await transport.send(message);
    return promise;
  }

  public onMessage(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  public offMessage(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  public onProgress(
    token: ProgressToken,
    handler: (progress: number, total?: number) => void
  ): void {
    this.progressHandlers.set(token, handler);
  }

  public offProgress(token: ProgressToken): void {
    this.progressHandlers.delete(token);
  }

  public getServerCapabilities(): ServerCapabilities | null {
    return this.serverCapabilities;
  }

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

    if (!this.serverCapabilities?.sampling?.createMessage) {
      throw new RequestFailedError('Server does not support sampling');
    }

    const progressToken = options?.progressHandler ? this.nextMessageId++ : undefined;
    if (progressToken && options?.progressHandler) {
      this.onProgress(progressToken, options.progressHandler);
    }

    try {
      const request = await this.prepareRequest('sampling/createMessage', {
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

  public onMessageCreated(handler: (message: SamplingMessage) => void): () => void {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.sampling?.createMessage) {
      throw new RequestFailedError('Server does not support sampling');
    }

    const messageHandler = async (message: JSONRPCMessage) => {
      if ('method' in message && message.method === 'notifications/messageCreated' && message.params) {
        handler(message.params.message as SamplingMessage);
      }
    };

    this.onMessage(messageHandler);

    // Return cleanup function
    return () => {
      this.offMessage(messageHandler);
    };
  }

  private async prepareRequest(method: string, params: unknown): Promise<JSONRPCRequest> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    let finalParams: Record<string, unknown>;
    if (params === undefined || params === null) {
      finalParams = {};
    } else if (typeof params === 'object') {
      finalParams = params as Record<string, unknown>;
    } else {
      finalParams = { data: params };
    }

    return {
      jsonrpc: JSONRPC_VERSION,
      id: this.nextMessageId++,
      method,
      params: finalParams,
    };
  }

  public async listPrompts(): Promise<Prompt[]> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.prompts?.listChanged) {
      throw new RequestFailedError('Server does not support prompts');
    }

    const request = await this.prepareRequest('prompts/list', {});
    const response = await this.send(request);
    return (response as { prompts: Prompt[] }).prompts;
  }

  public async getPrompt(name: string, args?: Record<string, string>): Promise<{ description: string; messages: PromptMessage[] }> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.prompts?.listChanged) {
      throw new RequestFailedError('Server does not support prompts');
    }

    const request = await this.prepareRequest('prompts/get', {
      name,
      arguments: args,
    });
    return await this.send(request) as { description: string; messages: PromptMessage[] };
  }

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
      const request = await this.prepareRequest('prompts/execute', {
        name,
        arguments: args,
        _meta: progressToken ? { progressToken } : undefined,
      });
      return await this.send(request) as { messages: PromptMessage[] };
    } finally {
      if (progressToken) {
        this.offProgress(progressToken);
      }
    }
  }

  public async listResources(): Promise<string[]> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.resources?.listChanged) {
      throw new RequestFailedError('Server does not support resources');
    }

    const request = await this.prepareRequest('resources/list', {});
    const response = await this.send(request);
    return (response as { resources: string[] }).resources;
  }

  public async readResource(name: string): Promise<unknown> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.resources?.listChanged) {
      throw new RequestFailedError('Server does not support resources');
    }

    const request = await this.prepareRequest('resources/read', { name });
    const response = await this.send(request);
    return (response as { content: unknown }).content;
  }

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

    const request = await this.prepareRequest('resources/subscribe', { name });
    await this.send(request);

    const messageHandler = async (message: JSONRPCMessage) => {
      if (
        'method' in message &&
        message.method === 'notifications/resourceChanged' &&
        message.params &&
        message.params.name === name
      ) {
        onChange(message.params.content);
      }
    };

    this.onMessage(messageHandler);

    return async () => {
      this.offMessage(messageHandler);
      const unsubscribeRequest = await this.prepareRequest('resources/unsubscribe', { name });
      await this.send(unsubscribeRequest);
    };
  }

  public async listRoots(): Promise<string[]> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.roots?.listChanged) {
      throw new RequestFailedError('Server does not support roots');
    }

    const request = await this.prepareRequest('roots/list', {});
    const response = await this.send(request);
    return (response as { roots: string[] }).roots;
  }

  public onRootsChanged(handler: (roots: string[]) => void): () => void {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    if (!this.serverCapabilities?.roots?.listChanged) {
      throw new RequestFailedError('Server does not support roots');
    }

    const messageHandler = async (message: JSONRPCMessage) => {
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

  public setAuthToken(token: string): void {
    this._authToken = token;
  }

  public clearAuthToken(): void {
    this._authToken = undefined;
  }

  public async invokeTool(name: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.initialized) {
      throw new ServerNotInitializedError('Client not initialized');
    }

    const request = await this.prepareRequest(name, {
      ...params,
      token: this._authToken,
    });
    return await this.send(request);
  }
}
