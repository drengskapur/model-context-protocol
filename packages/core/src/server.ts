import {
  type InitializeResult,
  type JSONRPCError,
  type JSONRPCMessage,
  type JSONRPCNotification,
  type JSONRPCRequest,
  type JSONRPCResponse,
  JSONRPC_VERSION,
  LATEST_PROTOCOL_VERSION,
  type LoggingLevel,
  type RequestId,
  type Result,
  type ServerCapabilities,
  type Prompt,
  type PromptMessage,
  type PromptArgument,
  type SamplingMessage,
  type ModelPreferences,
} from './schema.js';

import type { BaseSchema } from 'valibot';
import { object, parse, string } from 'valibot';
import {
  InvalidParamsError,
  InvalidRequestError,
  McpError,
  MethodNotFoundError,
  ParseError,
  ServerNotInitializedError,
} from './errors.js';
import type { McpTransport } from './transport';
import { Authorization, type AuthOptions } from './auth.js';
import {
  validateResource,
  validatePrompt,
  validateSamplingMessage,
  validateTool,
  validateReference,
  validateLoggingLevel,
  ValidationError,
} from './validation.js';

const initializeParamsSchema = object({
  protocolVersion: string(),
});

export interface ServerOptions {
  name: string;
  version: string;
  capabilities?: ServerCapabilities;
  auth?: AuthOptions;
}

export class PromptManager {
  private prompts = new Map<string, Prompt>();
  private executors = new Map<string, (args?: Record<string, string>) => Promise<PromptMessage[]>>();
  private subscribers = new Set<() => void>();

  registerPrompt(prompt: Prompt, executor?: (args?: Record<string, string>) => Promise<PromptMessage[]>): void {
    this.prompts.set(prompt.name, prompt);
    if (executor) {
      this.executors.set(prompt.name, executor);
    }
    this.notifySubscribers();
  }

  unregisterPrompt(name: string): void {
    this.prompts.delete(name);
    this.executors.delete(name);
    this.notifySubscribers();
  }

  getPrompt(name: string): Prompt | undefined {
    return this.prompts.get(name);
  }

  listPrompts(): Prompt[] {
    return Array.from(this.prompts.values());
  }

  validateArguments(
    prompt: Prompt,
    args?: Record<string, string>
  ): string | null {
    if (!prompt.arguments) {
      return null;
    }

    const requiredArgs = prompt.arguments.filter((arg) => arg.required);
    for (const arg of requiredArgs) {
      if (!args || !(arg.name in args)) {
        return `Missing required argument: ${arg.name}`;
      }
    }

    return null;
  }

  async executePrompt(name: string, args?: Record<string, string>): Promise<PromptMessage[]> {
    const prompt = this.getPrompt(name);
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }

    const validationError = this.validateArguments(prompt, args);
    if (validationError) {
      throw new Error(validationError);
    }

    const executor = this.executors.get(name);
    if (!executor) {
      throw new Error(`No executor registered for prompt: ${name}`);
    }

    return executor(args);
  }

  subscribe(onChange: () => void): void {
    this.subscribers.add(onChange);
  }

  unsubscribe(onChange: () => void): void {
    this.subscribers.delete(onChange);
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(subscriber => subscriber());
  }
}

export interface Resource {
  uri: string;
  mimeType: string;
  content: unknown;
}

export interface ResourceTemplate {
  uriTemplate: string;
  mimeType: string;
}

export class ResourceManager {
  private resources = new Map<string, Resource>();
  private templates = new Map<string, ResourceTemplate>();
  private subscribers = new Map<string, Set<(content: unknown) => void>>();

  registerResource(resource: Resource, content: unknown): void {
    this.resources.set(resource.uri, resource);
    this.notifyResourceListChanged();
    this.notifyResourceUpdated(resource.uri, content);
  }

  registerTemplate(template: ResourceTemplate): void {
    this.templates.set(template.uriTemplate, template);
    this.notifyResourceListChanged();
  }

  unregisterResource(uri: string): void {
    this.resources.delete(uri);
    this.subscribers.delete(uri);
    this.notifyResourceListChanged();
  }

  unregisterTemplate(uriTemplate: string): void {
    this.templates.delete(uriTemplate);
    this.notifyResourceListChanged();
  }

  getResource(uri: string): Resource | undefined {
    return this.resources.get(uri);
  }

  getTemplate(uriTemplate: string): ResourceTemplate | undefined {
    return this.templates.get(uriTemplate);
  }

  listResources(): Resource[] {
    return Array.from(this.resources.values());
  }

  listTemplates(): ResourceTemplate[] {
    return Array.from(this.templates.values());
  }

  subscribe(uri: string, onChange: (content: unknown) => void): void {
    if (!this.subscribers.has(uri)) {
      this.subscribers.set(uri, new Set());
    }
    this.subscribers.get(uri)?.add(onChange);
  }

  unsubscribe(uri: string, onChange: (content: unknown) => void): void {
    this.subscribers.get(uri)?.delete(onChange);
    if (this.subscribers.get(uri)?.size === 0) {
      this.subscribers.delete(uri);
    }
  }

  private notifyResourceUpdated(uri: string, content: unknown): void {
    this.subscribers.get(uri)?.forEach(subscriber => subscriber(content));
  }

  private notifyResourceListChanged(): void {
    // This will be handled by the server to send notifications
  }
}

export class RootManager {
  private roots = new Set<string>();
  private subscribers = new Set<(roots: string[]) => void>();

  addRoot(root: string): void {
    if (this.roots.has(root)) {
      return;
    }
    this.roots.add(root);
    this.notifySubscribers();
  }

  removeRoot(root: string): void {
    if (!this.roots.has(root)) {
      return;
    }
    this.roots.delete(root);
    this.notifySubscribers();
  }

  listRoots(): string[] {
    return Array.from(this.roots);
  }

  subscribe(handler: (roots: string[]) => void): void {
    this.subscribers.add(handler);
  }

  unsubscribe(handler: (roots: string[]) => void): void {
    this.subscribers.delete(handler);
  }

  private notifySubscribers(): void {
    const roots = this.listRoots();
    this.subscribers.forEach(subscriber => subscriber(roots));
  }
}

export class SamplingManager {
  private messageHandlers = new Set<(message: SamplingMessage) => void>();

  subscribe(handler: (message: SamplingMessage) => void): void {
    this.messageHandlers.add(handler);
  }

  unsubscribe(handler: (message: SamplingMessage) => void): void {
    this.messageHandlers.delete(handler);
  }

  notifyMessageCreated(message: SamplingMessage): void {
    this.messageHandlers.forEach(handler => handler(message));
  }
}

export class CompletionManager {
  private promptCompletions = new Map<string, (value: string) => Promise<string[]>>();
  private resourceCompletions = new Map<string, (value: string) => Promise<string[]>>();

  registerPromptCompletion(promptName: string, handler: (value: string) => Promise<string[]>): void {
    this.promptCompletions.set(promptName, handler);
  }

  registerResourceCompletion(uriTemplate: string, handler: (value: string) => Promise<string[]>): void {
    this.resourceCompletions.set(uriTemplate, handler);
  }

  async getCompletions(ref: PromptReference | ResourceReference, value: string): Promise<string[]> {
    if (ref.type === 'ref/prompt') {
      const handler = this.promptCompletions.get(ref.name);
      if (handler) {
        return handler(value);
      }
    } else if (ref.type === 'ref/resource') {
      const handler = this.resourceCompletions.get(ref.uri);
      if (handler) {
        return handler(value);
      }
    }
    return [];
  }
}

export class Server {
  private readonly options: ServerOptions;
  private transport: McpTransport | null = null;
  private initialized = false;
  private tools = new Map<
    string,
    {
      schema: BaseSchema<unknown, unknown, unknown>;
      handler: (params: unknown) => Promise<unknown>;
    }
  >();
  private prompts = new PromptManager();
  private loggingLevel: LoggingLevel | null = null;
  private resources = new ResourceManager();
  private roots = new RootManager();
  private sampling = new SamplingManager();
  private completion = new CompletionManager();

  constructor(options: ServerOptions) {
    this.options = options;
  }

  public tool<T extends BaseSchema<unknown, unknown, any>>(
    name: string,
    schema: T,
    handler: (params: Input<T>) => Promise<Output<T>>
  ): Promise<void> {
    const tool = {
      name,
      inputSchema: {
        type: 'object',
        properties: schema,
      },
    };
    await validateTool(tool);
    this.tools.set(name, {
      schema,
      handler: handler as (params: unknown) => Promise<unknown>,
    });

    if (this.transport && this.initialized) {
      this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/tools/list_changed',
      }).catch(() => {});
    }
    return Promise.resolve();
  }

  public removeTool(name: string): void {
    this.tools.delete(name);

    if (this.transport && this.initialized) {
      this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/tools/list_changed',
      }).catch(() => {});
    }
  }

  public connect(transport: McpTransport): Promise<void> {
    this.transport = transport;
    transport.onMessage(this.handleTransportMessage);
    return Promise.resolve();
  }

  private handleTransportMessage = async (
    message: JSONRPCMessage
  ): Promise<void> => {
    try {
      const response = await this.handleMessage(message);
      if (response && this.transport) {
        await this.transport.send(response);
      }
    } catch (error) {
      if (this.transport) {
        await this.transport.send(
          this.createErrorResponse(
            'id' in message ? message.id : null,
            error instanceof McpError
              ? error
              : new McpError(
                  -32603,
                  'Internal error',
                  error instanceof Error ? error.message : String(error)
                )
          )
        );
      }
    }
  };

  public handleMessage(
    message: JSONRPCMessage
  ): Promise<JSONRPCResponse | JSONRPCError | undefined> {
    if (!this.isValidJsonRpcMessage(message)) {
      return Promise.resolve(
        this.createErrorResponse(null, new InvalidRequestError())
      );
    }

    if (!('method' in message)) {
      return Promise.resolve(
        this.createErrorResponse(null, new InvalidRequestError())
      );
    }

    const methodMessage = message as JSONRPCRequest | JSONRPCNotification;
    return this.handleMethodCall(methodMessage);
  }

  private isValidJsonRpcMessage(message: JSONRPCMessage): boolean {
    return 'jsonrpc' in message && message.jsonrpc === '2.0';
  }

  private handleMethodCall(
    message: JSONRPCRequest | JSONRPCNotification
  ): Promise<JSONRPCResponse | JSONRPCError | undefined> {
    if (message.method === 'initialize') {
      if (!('id' in message)) {
        return Promise.resolve(
          this.createErrorResponse(
            null,
            new InvalidRequestError('Initialize must be a request')
          )
        );
      }
      return Promise.resolve(this.handleInitialize(message));
    }

    if (!this.initialized) {
      return Promise.resolve(
        this.createErrorResponse(
          'id' in message ? message.id : null,
          new ServerNotInitializedError()
        )
      );
    }

    if (message.method === 'logging/setLevel' && 'id' in message) {
      return this.handleSetLoggingLevel(message);
    }

    if (!('id' in message)) {
      // Handle notification
      return Promise.resolve(undefined);
    }

    return this.handleToolCall(message as JSONRPCRequest);
  }

  private async handleToolCall(request: JSONRPCRequest): Promise<JSONRPCResponse | JSONRPCError> {
    const tool = this.tools.get(request.method);
    if (!tool) {
      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        error: {
          code: -32601,
          message: 'Method not found',
        },
      };
    }

    try {
      const params = parse(tool.schema, request.params);
      const result = await tool.handler(params);
      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        result: { value: result },
      };
    } catch (error) {
      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        error: {
          code: -32602,
          message: error instanceof Error ? error.message : 'Invalid params',
        },
      };
    }
  }

  public async handleInitialize(
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCError> {
    if (this.initialized) {
      return this.createErrorResponse(
        request.id,
        new InvalidRequestError('Server already initialized')
      );
    }

    try {
      const params = parse(initializeParamsSchema, request.params);
      if (params.protocolVersion !== LATEST_PROTOCOL_VERSION) {
        return this.createErrorResponse(
          request.id,
          new InvalidRequestError(
            `Protocol version mismatch. Server: ${LATEST_PROTOCOL_VERSION}, Client: ${params.protocolVersion}`
          )
        );
      }

      this.initialized = true;
      const result: InitializeResult & Result = {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: this.options.name,
          version: this.options.version,
        },
        capabilities: this.options.capabilities ?? {},
      };

      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        result,
      };
    } catch (error) {
      return this.createErrorResponse(
        request.id,
        new ParseError(error instanceof Error ? error.message : String(error))
      );
    }
  }

  private async handleSetLoggingLevel(
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCError> {
    if (!this.options.capabilities?.logging) {
      return this.createErrorResponse(
        request.id,
        new MethodNotFoundError('Logging not supported')
      );
    }

    try {
      const { level } = request.params as { level: LoggingLevel };
      await validateLoggingLevel(level);
      this.loggingLevel = level;
      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        result: {},
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        return this.createErrorResponse(
          request.id,
          new InvalidParamsError(error.message)
        );
      }
      throw error;
    }
  }

  public async sendLogMessage(
    level: LoggingLevel,
    data: unknown,
    logger?: string
  ): Promise<void> {
    if (!this.options.capabilities?.logging || !this.transport || !this.initialized) {
      return;
    }

    // Only send if the current level is set and the message level is equal or higher priority
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
    if (
      this.loggingLevel &&
      levels.indexOf(level) >= levels.indexOf(this.loggingLevel)
    ) {
      await this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/message',
        params: {
          level,
          logger,
          data,
        },
      });
    }
  }

  private createErrorResponse(
    id: RequestId | null,
    error: McpError
  ): JSONRPCError {
    // Convert null to a default RequestId value
    const responseId: RequestId = id ?? 0;

    return {
      jsonrpc: JSONRPC_VERSION,
      id: responseId,
      error: error.toJSON(),
    };
  }

  public async prompt(
    prompt: Prompt,
    executor?: (args?: Record<string, string>) => Promise<PromptMessage[]>
  ): Promise<void> {
    await validatePrompt(prompt);
    this.prompts.registerPrompt(prompt, executor);
    if (this.transport && this.initialized) {
      this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/prompts/list_changed',
      }).catch(() => {});
    }
  }

  public removePrompt(name: string): void {
    this.prompts.unregisterPrompt(name);
    if (this.transport && this.initialized) {
      this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/prompts/list_changed',
      }).catch(() => {});
    }
  }

  private async handlePing(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {},
    };
  }

  private async handleListPrompts(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {
        prompts: this.prompts.listPrompts(),
      },
    };
  }

  private async handleGetPrompt(request: JSONRPCRequest): Promise<JSONRPCResponse | JSONRPCError> {
    const { name, arguments: args } = request.params as {
      name: string;
      arguments?: Record<string, string>;
    };

    const prompt = this.prompts.getPrompt(name);
    if (!prompt) {
      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        error: {
          code: -32602,
          message: `Prompt not found: ${name}`,
        },
      };
    }

    const validationError = this.prompts.validateArguments(prompt, args);
    if (validationError) {
      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        error: {
          code: -32602,
          message: validationError,
        },
      };
    }

    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {
        description: prompt.description,
        messages: await this.generatePromptMessages(prompt, args),
      },
    };
  }

  private async handleExecutePrompt(request: JSONRPCRequest): Promise<JSONRPCResponse | JSONRPCError> {
    const { name, arguments: args } = request.params as {
      name: string;
      arguments?: Record<string, string>;
    };

    try {
      const messages = await this.prompts.executePrompt(name, args);

      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        result: {
          messages,
        },
      };
    } catch (error) {
      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        error: {
          code: -32602,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  private async handleListTools(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {
        tools: Array.from(this.tools.keys()),
      },
    };
  }

  private async handleListResources(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {
        resources: this.resources.listResources(),
      },
    };
  }

  private async handleListResourceTemplates(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {
        resourceTemplates: this.resources.listTemplates(),
      },
    };
  }

  private async handleReadResource(request: JSONRPCRequest): Promise<JSONRPCResponse | JSONRPCError> {
    const { uri } = request.params as { uri: string };
    const resource = this.resources.getResource(uri);

    if (!resource) {
      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        error: {
          code: -32602,
          message: `Resource not found: ${uri}`,
        },
      };
    }

    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {
        contents: [{
          uri,
          mimeType: resource.mimeType,
          text: resource.content as string, // For now, assuming text content
        }],
      },
    };
  }

  private async handleSubscribeResource(request: JSONRPCRequest): Promise<JSONRPCResponse | JSONRPCError> {
    const { uri } = request.params as { uri: string };
    const resource = this.resources.getResource(uri);

    if (!resource) {
      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        error: {
          code: -32602,
          message: `Resource not found: ${uri}`,
        },
      };
    }

    const onChange = (content: unknown) => {
      if (this.transport) {
        this.transport.send({
          jsonrpc: JSONRPC_VERSION,
          method: 'notifications/resources/updated',
          params: {
            uri,
            content,
          },
        }).catch(() => {});
      }
    };

    this.resources.subscribe(uri, onChange);

    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {},
    };
  }

  private async handleUnsubscribeResource(request: JSONRPCRequest): Promise<JSONRPCResponse | JSONRPCError> {
    const { uri } = request.params as { uri: string };
    const resource = this.resources.getResource(uri);

    if (!resource) {
      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        error: {
          code: -32602,
          message: `Resource not found: ${uri}`,
        },
      };
    }

    // Note: We don't actually unsubscribe here because we don't store the onChange handler
    // In a real implementation, we would need to store the handler per client/request

    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {},
    };
  }

  private async handleListRoots(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {
        roots: this.roots.listRoots(),
      },
    };
  }

  private async handleGetRoot(request: JSONRPCRequest): Promise<JSONRPCResponse | JSONRPCError> {
    const { uri } = request.params as { uri: string };
    const roots = this.roots.listRoots();
    const root = roots.find(r => r === uri);

    if (!root) {
      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        error: {
          code: -32602,
          message: `Root not found: ${uri}`,
        },
      };
    }

    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {
        root: {
          uri,
          name: uri, // In a real implementation, you might want to store names separately
        },
      },
    };
  }

  private async handleCreateMessage(request: JSONRPCRequest): Promise<JSONRPCResponse | JSONRPCError> {
    const params = request.params as {
      messages: SamplingMessage[];
      modelPreferences?: ModelPreferences;
      systemPrompt?: string;
      includeContext?: 'none' | 'thisServer' | 'allServers';
      temperature?: number;
      maxTokens: number;
      stopSequences?: string[];
      metadata?: Record<string, unknown>;
    };

    try {
      // Validate each message
      for (const message of params.messages) {
        await validateSamplingMessage(message);
      }

      // This is a placeholder implementation
      const message: SamplingMessage = {
        role: 'assistant',
        content: {
          type: 'text',
          text: 'This is a placeholder response',
        },
      };

      this.sampling.notifyMessageCreated(message);

      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        result: {
          message,
        },
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        return this.createErrorResponse(
          request.id,
          new InvalidParamsError(error.message)
        );
      }
      return this.createErrorResponse(
        request.id,
        new McpError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  private async handleComplete(request: JSONRPCRequest): Promise<JSONRPCResponse | JSONRPCError> {
    try {
      const { ref, argument } = request.params as {
        ref: PromptReference | ResourceReference;
        argument: {
          name: string;
          value: string;
        };
      };

      await validateReference(ref);
      const completions = await this.completion.getCompletions(ref, argument.value);

      return {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        result: {
          completion: {
            values: completions.slice(0, 100),
            total: completions.length,
            hasMore: completions.length > 100,
          },
        },
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        return this.createErrorResponse(
          request.id,
          new InvalidParamsError(error.message)
        );
      }
      throw error;
    }
  }

  private async handleRequest(request: JSONRPCRequest): Promise<void> {
    if (!this.transport) {
      return;
    }

    let response: JSONRPCResponse | JSONRPCError;

    try {
      switch (request.method) {
        case 'ping':
          response = await this.handlePing(request);
          break;
        case 'initialize':
          response = await this.handleInitialize(request);
          break;
        case 'prompts/list':
          response = await this.handleListPrompts(request);
          break;
        case 'prompts/get':
          response = await this.handleGetPrompt(request);
          break;
        case 'prompts/execute':
          response = await this.handleExecutePrompt(request);
          break;
        case 'logging/setLevel':
          response = await this.handleSetLoggingLevel(request);
          break;
        case 'tools/list':
          response = await this.handleListTools(request);
          break;
        case 'resources/list':
          response = await this.handleListResources(request);
          break;
        case 'resources/templates/list':
          response = await this.handleListResourceTemplates(request);
          break;
        case 'resources/read':
          response = await this.handleReadResource(request);
          break;
        case 'resources/subscribe':
          response = await this.handleSubscribeResource(request);
          break;
        case 'resources/unsubscribe':
          response = await this.handleUnsubscribeResource(request);
          break;
        case 'roots/list':
          response = await this.handleListRoots(request);
          break;
        case 'roots/get':
          response = await this.handleGetRoot(request);
          break;
        case 'sampling/createMessage':
          response = await this.handleCreateMessage(request);
          break;
        case 'completion/complete':
          response = await this.handleComplete(request);
          break;
        default:
          response = await this.handleToolCall(request);
      }
    } catch (error) {
      response = {
        jsonrpc: JSONRPC_VERSION,
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      };
    }

    await this.transport.send(response);
  }

  public promptCompletion(promptName: string, handler: (value: string) => Promise<string[]>): void {
    this.completion.registerPromptCompletion(promptName, handler);
  }

  public resourceCompletion(uriTemplate: string, handler: (value: string) => Promise<string[]>): void {
    this.completion.registerResourceCompletion(uriTemplate, handler);
  }

  public async resource(resource: Resource, content: unknown): Promise<void> {
    await validateResource(resource);
    this.resources.registerResource(resource, content);
    if (this.transport && this.initialized) {
      this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/resources/list_changed',
      }).catch(() => {});
    }
  }

  public resourceTemplate(template: ResourceTemplate): void {
    this.resources.registerTemplate(template);
    if (this.transport) {
      this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/resources/list_changed',
      }).catch(() => {});
    }
  }

  public addRoot(root: string): void {
    this.roots.addRoot(root);
    if (this.transport) {
      this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/rootsChanged',
        params: {
          roots: this.roots.listRoots(),
        },
      }).catch(() => {});
    }
  }

  public removeRoot(root: string): void {
    this.roots.removeRoot(root);
    if (this.transport) {
      this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/rootsChanged',
        params: {
          roots: this.roots.listRoots(),
        },
      }).catch(() => {});
    }
  }

  // Add public methods for sampling
  public onMessageCreated(handler: (message: SamplingMessage) => void): () => void {
    this.sampling.subscribe(handler);
    return () => this.sampling.unsubscribe(handler);
  }
}

export interface McpServerOptions {
  name: string;
  version: string;
  capabilities?: ServerCapabilities;
}

export class McpServer {
  private server: Server;

  constructor(options: McpServerOptions) {
    this.server = new Server(options);
  }

  public tool<T extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(
    name: string,
    schema: T,
    handler: (params: unknown) => Promise<unknown>
  ): void {
    this.server.tool(name, schema, handler);
  }

  public connect(transport: McpTransport): Promise<void> {
    return this.server.connect(transport);
  }

  public async disconnect(): Promise<void> {
    await this.server.handleMessage({
      jsonrpc: JSONRPC_VERSION,
      method: 'disconnect',
    });
  }
}
