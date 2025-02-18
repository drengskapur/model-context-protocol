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
  type ResourceReference,
  type PromptReference,
  type Tool,
  type ProgressToken,
} from './schema.js';
import { type BaseSchema, ValiError } from 'valibot';
import { object, parse, string } from 'valibot';
import {
  InvalidParamsError,
  InvalidRequestError,
  McpError,
  MethodNotFoundError,
  ParseError,
  ServerNotInitializedError,
} from './errors.js';
import type { McpTransport } from './transport.js';
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

/**
 * Server options.
 */
export interface ServerOptions {
  /**
   * Server name.
   */
  name: string;
  /**
   * Server version.
   */
  version: string;
  /**
   * Server capabilities.
   */
  capabilities?: ServerCapabilities;
  /**
   * Authentication options.
   */
  auth?: AuthOptions;
}

/**
 * Manages prompts.
 */
export class PromptManager {
  /**
   * Map of registered prompts.
   */
  private prompts = new Map<string, Prompt>();
  /**
   * Map of prompt executors.
   */
  private executors = new Map<
    string,
    (args?: Record<string, string>) => Promise<PromptMessage[]>
  >();
  /**
   * Set of prompt subscribers.
   */
  private subscribers = new Set<() => void>();

  /**
   * Registers a new prompt.
   * @param prompt Prompt to register
   * @param executor Executor function for the prompt
   */
  registerPrompt(
    prompt: Prompt,
    executor?: (args?: Record<string, string>) => Promise<PromptMessage[]>
  ): void {
    this.prompts.set(prompt.name, prompt);
    if (executor) {
      this.executors.set(prompt.name, executor);
    }
    this.notifySubscribers();
  }

  /**
   * Unregisters a prompt.
   * @param name Name of the prompt to unregister
   */
  unregisterPrompt(name: string): void {
    this.prompts.delete(name);
    this.executors.delete(name);
    this.notifySubscribers();
  }

  /**
   * Gets a prompt by name.
   * @param name Name of the prompt to get
   * @returns Prompt instance or undefined if not found
   */
  getPrompt(name: string): Prompt | undefined {
    return this.prompts.get(name);
  }

  /**
   * Lists all registered prompts.
   * @returns Array of prompt instances
   */
  listPrompts(): Prompt[] {
    return Array.from(this.prompts.values());
  }

  /**
   * Validates prompt arguments.
   * @param prompt Prompt to validate
   * @param args Argument values
   * @returns Error message or null if valid
   */
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

  /**
   * Executes a prompt.
   * @param name Name of the prompt to execute
   * @param args Argument values
   * @returns Promise that resolves with prompt messages
   */
  async executePrompt(
    name: string,
    args?: Record<string, string>
  ): Promise<PromptMessage[]> {
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

  /**
   * Subscribes to prompt changes.
   * @param onChange Callback function
   */
  subscribe(onChange: () => void): void {
    this.subscribers.add(onChange);
  }

  /**
   * Unsubscribes from prompt changes.
   * @param onChange Callback function
   */
  unsubscribe(onChange: () => void): void {
    this.subscribers.delete(onChange);
  }

  /**
   * Notifies prompt subscribers.
   */
  private notifySubscribers(): void {
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}

/**
 * Resource representation.
 */
export interface Resource {
  /**
   * Resource URI.
   */
  uri: string;
  /**
   * Resource MIME type.
   */
  mimeType: string;
  /**
   * Resource content.
   */
  content: unknown;
}

/**
 * Resource template representation.
 */
export interface ResourceTemplate {
  /**
   * Resource template URI.
   */
  uriTemplate: string;
  /**
   * Resource template MIME type.
   */
  mimeType: string;
}

/**
 * Manages resources.
 */
export class ResourceManager {
  /**
   * Map of registered resources.
   */
  private resources = new Map<string, Resource>();
  /**
   * Map of registered resource templates.
   */
  private templates = new Map<string, ResourceTemplate>();
  /**
   * Map of resource subscribers.
   */
  private subscribers = new Map<string, Set<(content: unknown) => void>>();

  /**
   * Registers a new resource.
   * @param resource Resource to register
   * @param content Initial content for the resource
   */
  registerResource(resource: Resource, content: unknown): void {
    this.resources.set(resource.uri, resource);
    this.notifyResourceListChanged();
    this.notifyResourceUpdated(resource.uri, content);
  }

  /**
   * Registers a new resource template.
   * @param template Resource template to register
   */
  registerTemplate(template: ResourceTemplate): void {
    this.templates.set(template.uriTemplate, template);
    this.notifyResourceListChanged();
  }

  /**
   * Unregisters a resource.
   * @param uri URI of the resource to unregister
   */
  unregisterResource(uri: string): void {
    this.resources.delete(uri);
    this.subscribers.delete(uri);
    this.notifyResourceListChanged();
  }

  /**
   * Unregisters a resource template.
   * @param uriTemplate URI template of the resource to unregister
   */
  unregisterTemplate(uriTemplate: string): void {
    this.templates.delete(uriTemplate);
    this.notifyResourceListChanged();
  }

  /**
   * Gets a resource by URI.
   * @param uri URI of the resource to get
   * @returns Resource instance or undefined if not found
   */
  getResource(uri: string): Resource | undefined {
    return this.resources.get(uri);
  }

  /**
   * Gets a resource template by URI template.
   * @param uriTemplate URI template of the resource to get
   * @returns Resource template instance or undefined if not found
   */
  getTemplate(uriTemplate: string): ResourceTemplate | undefined {
    return this.templates.get(uriTemplate);
  }

  /**
   * Lists all registered resources.
   * @returns Array of resource instances
   */
  listResources(): Resource[] {
    return Array.from(this.resources.values());
  }

  /**
   * Lists all registered resource templates.
   * @returns Array of resource template instances
   */
  listTemplates(): ResourceTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Subscribes to resource changes.
   * @param uri URI of the resource to subscribe to
   * @param onChange Callback function
   */
  subscribe(uri: string, onChange: (content: unknown) => void): void {
    if (!this.subscribers.has(uri)) {
      this.subscribers.set(uri, new Set());
    }
    this.subscribers.get(uri)?.add(onChange);
  }

  /**
   * Unsubscribes from resource changes.
   * @param uri URI of the resource to unsubscribe from
   * @param onChange Callback function
   */
  unsubscribe(uri: string, onChange: (content: unknown) => void): void {
    this.subscribers.get(uri)?.delete(onChange);
    if (this.subscribers.get(uri)?.size === 0) {
      this.subscribers.delete(uri);
    }
  }

  /**
   * Notifies resource subscribers.
   * @param uri URI of the resource that changed
   * @param content New content for the resource
   */
  private notifyResourceUpdated(uri: string, content: unknown): void {
    const subscribers = this.subscribers.get(uri);
    if (subscribers) {
      for (const subscriber of subscribers) {
        subscriber(content);
      }
    }
  }

  /**
   * Notifies resource list subscribers.
   */
  private notifyResourceListChanged(): void {
    // This will be handled by the server to send notifications
  }
}

/**
 * Manages roots.
 */
export class RootManager {
  /**
   * Set of registered roots.
   */
  private roots = new Set<string>();
  /**
   * Set of root subscribers.
   */
  private subscribers = new Set<(roots: string[]) => void>();

  /**
   * Adds a new root.
   * @param root Root to add
   */
  addRoot(root: string): void {
    if (this.roots.has(root)) {
      return;
    }
    this.roots.add(root);
    this.notifySubscribers();
  }

  /**
   * Removes a root.
   * @param root Root to remove
   */
  removeRoot(root: string): void {
    if (!this.roots.has(root)) {
      return;
    }
    this.roots.delete(root);
    this.notifySubscribers();
  }

  /**
   * Lists all registered roots.
   * @returns Array of root URIs
   */
  listRoots(): string[] {
    return Array.from(this.roots);
  }

  /**
   * Subscribes to root changes.
   * @param handler Callback function
   */
  subscribe(handler: (roots: string[]) => void): void {
    this.subscribers.add(handler);
  }

  /**
   * Unsubscribes from root changes.
   * @param handler Callback function
   */
  unsubscribe(handler: (roots: string[]) => void): void {
    this.subscribers.delete(handler);
  }

  /**
   * Notifies root subscribers.
   */
  private notifySubscribers(): void {
    const roots = this.listRoots();
    for (const subscriber of this.subscribers) {
      subscriber(roots);
    }
  }
}

/**
 * Manages sampling messages.
 */
export class SamplingManager {
  /**
   * Set of message handlers.
   */
  private messageHandlers = new Set<(message: SamplingMessage) => void>();

  /**
   * Subscribes to sampling messages.
   * @param handler Callback function
   */
  subscribe(handler: (message: SamplingMessage) => void): void {
    this.messageHandlers.add(handler);
  }

  /**
   * Unsubscribes from sampling messages.
   * @param handler Callback function
   */
  unsubscribe(handler: (message: SamplingMessage) => void): void {
    this.messageHandlers.delete(handler);
  }

  /**
   * Notifies message handlers.
   * @param message Sampling message
   */
  notifyMessageCreated(message: SamplingMessage): void {
    for (const handler of this.messageHandlers) {
      handler(message);
    }
  }
}

/**
 * Manages completions.
 */
export class CompletionManager {
  /**
   * Map of prompt completions.
   */
  private promptCompletions = new Map<
    string,
    (value: string) => Promise<string[]>
  >();
  /**
   * Map of resource completions.
   */
  private resourceCompletions = new Map<
    string,
    (value: string) => Promise<string[]>
  >();

  /**
   * Registers a new prompt completion.
   * @param promptName Name of the prompt
   * @param handler Completion handler function
   */
  registerPromptCompletion(
    promptName: string,
    handler: (value: string) => Promise<string[]>
  ): void {
    this.promptCompletions.set(promptName, handler);
  }

  /**
   * Registers a new resource completion.
   * @param uriTemplate URI template of the resource
   * @param handler Completion handler function
   */
  registerResourceCompletion(
    uriTemplate: string,
    handler: (value: string) => Promise<string[]>
  ): void {
    this.resourceCompletions.set(uriTemplate, handler);
  }

  /**
   * Gets completions for a prompt or resource.
   * @param ref Reference to the prompt or resource
   * @param value Value to complete
   * @returns Promise that resolves with completion values
   */
  async getCompletions(
    ref:
      | { type: 'ref/prompt'; name: string }
      | { type: 'ref/resource'; uri: string },
    value: string
  ): Promise<string[]> {
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

/**
 * Server implementation of the Model Context Protocol.
 * Provides a framework for handling JSON-RPC requests and managing resources.
 */
export class Server {
  private readonly options: ServerOptions;
  private transport: McpTransport | null = null;
  private initialized = false;
  private tools = new Map<
    string,
    {
      schema: BaseSchema;
      handler: (params: unknown) => Promise<unknown>;
    }
  >();
  private promptManager = new PromptManager();
  private loggingLevel: LoggingLevel | null = null;
  private resourceManager = new ResourceManager();
  private rootManager = new RootManager();
  private samplingManager = new SamplingManager();
  private completionManager = new CompletionManager();

  constructor(options: ServerOptions) {
    this.options = {
      capabilities: {},
      auth: undefined,
      ...options,
    };
  }

  /**
   * Registers a new tool with the server.
   * @param name Unique name for the tool
   * @param schema Valibot schema for validating tool parameters
   * @param handler Function to execute when the tool is called
   * @returns Promise that resolves when the tool is registered
   * @throws {Error} If a tool with the same name already exists
   */
  public async tool<T extends BaseSchema>(
    name: string,
    schema: T,
    handler: (params: unknown) => Promise<unknown>
  ): Promise<void> {
    const tool: Tool = {
      name,
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    };
    await validateTool(tool);
    this.tools.set(name, {
      schema,
      handler,
    });

    if (this.transport && this.initialized) {
      await this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/tools/list_changed',
      });
    }
  }

  /**
   * Removes a tool from the server.
   * @param name Name of the tool to remove
   */
  public removeTool(name: string): void {
    this.tools.delete(name);

    if (this.transport && this.initialized) {
      this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/tools/list_changed',
      });
    }
  }

  /**
   * Connects the server to a transport.
   * @param transport Transport instance to connect to
   * @returns Promise that resolves when connected
   */
  public connect(transport: McpTransport): Promise<void> {
    this.transport = transport;
    transport.onMessage(this.handleTransportMessage);
    return Promise.resolve();
  }

  /**
   * Handles a transport message.
   * @param message JSON-RPC message
   */
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

  /**
   * Handles a JSON-RPC message.
   * @param message JSON-RPC message
   * @returns Promise that resolves with a JSON-RPC response
   */
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

  /**
   * Checks if a message is a valid JSON-RPC message.
   * @param message JSON-RPC message
   * @returns True if the message is valid, false otherwise
   */
  private isValidJsonRpcMessage(message: JSONRPCMessage): boolean {
    return 'jsonrpc' in message && message.jsonrpc === '2.0';
  }

  /**
   * Handles a method call.
   * @param message JSON-RPC request or notification
   * @returns Promise that resolves with a JSON-RPC response
   */
  private async handleMethodCall(
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

    if (!('id' in message)) {
      // Handle notification
      return Promise.resolve(undefined);
    }

    const request = message as JSONRPCRequest;
    switch (request.method) {
      case 'ping':
        return Promise.resolve(this.handlePing(request));
      case 'initialize':
        return this.handleInitialize(request);
      case 'prompts/list':
        return Promise.resolve(this.handleListPrompts(request));
      case 'prompts/get':
        return this.handleGetPrompt(request);
      case 'prompts/execute':
        return this.handleExecutePrompt(request);
      case 'logging/setLevel':
        return this.handleSetLoggingLevel(request);
      case 'tools/list':
        return Promise.resolve(this.handleListTools(request));
      case 'resources/list':
        return Promise.resolve(this.handleListResources(request));
      case 'resources/templates/list':
        return Promise.resolve(this.handleListResourceTemplates(request));
      case 'resources/read':
        return this.handleReadResource(request);
      case 'resources/subscribe':
        return this.handleSubscribeResource(request);
      case 'resources/unsubscribe':
        return this.handleUnsubscribeResource(request);
      case 'roots/list':
        return Promise.resolve(this.handleListRoots(request));
      case 'roots/get':
        return this.handleGetRoot(request);
      case 'sampling/createMessage':
        return this.handleCreateMessage(request);
      case 'completion/complete':
        return this.handleComplete(request);
      default:
        return this.handleToolCall(request);
    }
  }

  /**
   * Handles a tool call.
   * @param request JSON-RPC request
   * @returns Promise that resolves with a JSON-RPC response
   */
  private async handleToolCall(
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCError> {
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
      if (error instanceof ValiError) {
        return {
          jsonrpc: JSONRPC_VERSION,
          id: request.id,
          error: {
            code: -32602,
            message: error.message,
          },
        };
      }
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

  /**
   * Handles an initialize request.
   * @param request JSON-RPC request
   * @returns Promise that resolves with a JSON-RPC response
   */
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

  /**
   * Handles a set logging level request.
   * @param request JSON-RPC request
   * @returns Promise that resolves with a JSON-RPC response
   */
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

  /**
   * Sends a log message.
   * @param level Log level
   * @param data Log data
   * @param logger Logger name
   * @returns Promise that resolves when the message is sent
   */
  public async sendLogMessage(
    level: LoggingLevel,
    data: unknown,
    logger?: string
  ): Promise<void> {
    if (
      !this.options.capabilities?.logging ||
      !this.transport ||
      !this.initialized
    ) {
      return Promise.resolve();
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
      return this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/message',
        params: {
          level,
          logger,
          data,
        },
      });
    }
    return Promise.resolve();
  }

  /**
   * Creates an error response.
   * @param id Request ID
   * @param error Error instance
   * @returns JSON-RPC error response
   */
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

  /**
   * Registers a new prompt.
   * @param prompt Prompt to register
   * @param executor Executor function for the prompt
   * @returns Promise that resolves when the prompt is registered
   */
  public async prompt(
    prompt: Prompt,
    executor?: (args?: Record<string, string>) => Promise<PromptMessage[]>
  ): Promise<void> {
    await validatePrompt(prompt);
    this.promptManager.registerPrompt(prompt, executor);
    if (this.transport && this.initialized) {
      this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/prompts/list_changed',
      });
    }
  }

  /**
   * Removes a prompt.
   * @param name Name of the prompt to remove
   */
  public removePrompt(name: string): void {
    this.promptManager.unregisterPrompt(name);
    if (this.transport && this.initialized) {
      this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/prompts/list_changed',
      });
    }
  }

  /**
   * Handles a ping request.
   * @param request JSON-RPC request
   * @returns JSON-RPC response
   */
  private handlePing(request: JSONRPCRequest): JSONRPCResponse {
    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {},
    };
  }

  /**
   * Handles a list prompts request.
   * @param request JSON-RPC request
   * @returns JSON-RPC response
   */
  private handleListPrompts(request: JSONRPCRequest): JSONRPCResponse {
    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {
        prompts: this.promptManager.listPrompts(),
      },
    };
  }

  /**
   * Handles a get prompt request.
   * @param request JSON-RPC request
   * @returns Promise that resolves with a JSON-RPC response
   */
  private async handleGetPrompt(
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCError> {
    const { name, arguments: args } = request.params as {
      name: string;
      arguments?: Record<string, string>;
    };

    const prompt = this.promptManager.getPrompt(name);
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

    const validationError = this.promptManager.validateArguments(prompt, args);
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

  /**
   * Handles an execute prompt request.
   * @param request JSON-RPC request
   * @returns Promise that resolves with a JSON-RPC response
   */
  private async handleExecutePrompt(
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCError> {
    const { name, arguments: args } = request.params as {
      name: string;
      arguments?: Record<string, string>;
    };

    try {
      const messages = await this.promptManager.executePrompt(name, args);

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

  /**
   * Handles a list tools request.
   * @param request JSON-RPC request
   * @returns JSON-RPC response
   */
  private handleListTools(request: JSONRPCRequest): JSONRPCResponse {
    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {
        tools: Array.from(this.tools.keys()),
      },
    };
  }

  /**
   * Handles a list resources request.
   * @param request JSON-RPC request
   * @returns JSON-RPC response
   */
  private handleListResources(request: JSONRPCRequest): JSONRPCResponse {
    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {
        resources: this.resourceManager.listResources(),
      },
    };
  }

  /**
   * Handles a list resource templates request.
   * @param request JSON-RPC request
   * @returns JSON-RPC response
   */
  private handleListResourceTemplates(
    request: JSONRPCRequest
  ): JSONRPCResponse {
    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {
        resourceTemplates: this.resourceManager.listTemplates(),
      },
    };
  }

  /**
   * Handles a read resource request.
   * @param request JSON-RPC request
   * @returns Promise that resolves with a JSON-RPC response
   */
  private async handleReadResource(
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCError> {
    const { uri } = request.params as { uri: string };
    const resource = this.resourceManager.getResource(uri);

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
        contents: [
          {
            uri,
            mimeType: resource.mimeType,
            text: resource.content as string, // For now, assuming text content
          },
        ],
      },
    };
  }

  /**
   * Handles a subscribe resource request.
   * @param request JSON-RPC request
   * @returns Promise that resolves with a JSON-RPC response
   */
  private async handleSubscribeResource(
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCError> {
    const { uri } = request.params as { uri: string };
    const resource = this.resourceManager.getResource(uri);

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
        });
      }
    };

    this.resourceManager.subscribe(uri, onChange);

    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {},
    };
  }

  /**
   * Handles an unsubscribe resource request.
   * @param request JSON-RPC request
   * @returns Promise that resolves with a JSON-RPC response
   */
  private async handleUnsubscribeResource(
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCError> {
    const { uri } = request.params as { uri: string };
    const resource = this.resourceManager.getResource(uri);

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

  /**
   * Handles a list roots request.
   * @param request JSON-RPC request
   * @returns JSON-RPC response
   */
  private handleListRoots(request: JSONRPCRequest): JSONRPCResponse {
    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      result: {
        roots: this.rootManager.listRoots(),
      },
    };
  }

  /**
   * Handles a get root request.
   * @param request JSON-RPC request
   * @returns Promise that resolves with a JSON-RPC response
   */
  private async handleGetRoot(
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCError> {
    const { uri } = request.params as { uri: string };
    const roots = this.rootManager.listRoots();
    const root = roots.find((r) => r === uri);

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

  /**
   * Handles a create message request.
   * @param request JSON-RPC request
   * @returns Promise that resolves with a JSON-RPC response
   */
  private async handleCreateMessage(
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCError> {
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

      this.samplingManager.notifyMessageCreated(message);

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
        new McpError(error instanceof Error ? error.message : String(error))
      );
    }
  }

  /**
   * Handles a complete request.
   * @param request JSON-RPC request
   * @returns Promise that resolves with a JSON-RPC response
   */
  private async handleComplete(
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCError> {
    try {
      const { ref, argument } = request.params as {
        ref: PromptReference | ResourceReference;
        argument: {
          name: string;
          value: string;
        };
      };

      await validateReference(ref);
      const completions = await this.completionManager.getCompletions(
        ref,
        argument.value
      );

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

  /**
   * Generates prompt messages.
   * @param prompt Prompt instance
   * @param args Argument values
   * @returns Array of prompt messages
   */
  private generatePromptMessages(
    prompt: Prompt,
    args?: Record<string, string>
  ): PromptMessage[] {
    // This is a placeholder implementation
    // In a real implementation, you would:
    // 1. Template the prompt using the arguments
    // 2. Generate any dynamic content
    // 3. Format everything as PromptMessages
    return [{
      role: 'assistant',
      content: {
        type: 'text',
        text: `Generated message for prompt ${prompt.name}${args ? ` with args ${JSON.stringify(args)}` : ''}`
      }
    }];
  }

  public async sendProgress(
    token: ProgressToken,
    progress: number,
    total?: number
  ): Promise<void> {
    if (!this.transport || !this.initialized) {
      return Promise.resolve();
    }

    return this.transport.send({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/progress',
      params: {
        progressToken: token,
        progress,
        total,
      },
    });
  }

  public async cancelRequest(
    requestId: string | number,
    reason?: string
  ): Promise<void> {
    if (!this.transport || !this.initialized) {
      return Promise.resolve();
    }

    return this.transport.send({
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/cancelled',
      params: {
        requestId,
        reason,
      },
    });
  }

  /**
   * Registers a new resource.
   * @param resource Resource to register
   * @param content Initial content for the resource
   */
  public resource(resource: Resource, content: unknown): void {
    this.resourceManager.registerResource(resource, content);
    if (this.transport && this.initialized) {
      this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/resources/list_changed',
      });
    }
  }

  /**
   * Registers a new resource template.
   * @param template Resource template to register
   */
  public resourceTemplate(template: ResourceTemplate): void {
    this.resourceManager.registerTemplate(template);
    if (this.transport && this.initialized) {
      this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/resources/list_changed',
      });
    }
  }
}

/**
 * Server options.
 */
export interface McpServerOptions {
  /**
   * Server name.
   */
  name: string;
  /**
   * Server version.
   */
  version: string;
  /**
   * Server capabilities.
   */
  capabilities?: ServerCapabilities;
}

/**
 * MCP server implementation.
 */
export class McpServer {
  /**
   * Server instance.
   */
  private server: Server;

  /**
   * Creates a new McpServer instance.
   * @param options Server configuration options
   */
  constructor(options: McpServerOptions) {
    this.server = new Server(options);
  }

  /**
   * Registers a new tool.
   * @param name Unique name for the tool
   * @param schema Valibot schema for validating tool parameters
   * @param handler Function to execute when the tool is called
   */
  public tool<T extends BaseSchema>(
    name: string,
    schema: T,
    handler: (params: unknown) => Promise<unknown>
  ): void {
    this.server.tool(name, schema, handler);
  }

  /**
   * Connects the server to a transport.
   * @param transport Transport instance to connect to
   * @returns Promise that resolves when connected
   */
  public connect(transport: McpTransport): Promise<void> {
    return this.server.connect(transport);
  }

  /**
   * Disconnects the server from its transport.
   * @returns Promise that resolves when disconnected
   */
  public async disconnect(): Promise<void> {
    await this.server.handleMessage({
      jsonrpc: JSONRPC_VERSION,
      method: 'disconnect',
    });
  }
}
