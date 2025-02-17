import type { McpTransport } from './transport.js';
import type {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  JSONRPCNotification,
  ProgressToken,
  Result,
  ClientCapabilities,
  InitializeResult,
  ServerCapabilities,
} from './schema.js';
import type { MessageHandler } from './transport.js';
import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from './schema.js';
import { McpError, RequestFailedError, ServerNotInitializedError } from './errors.js';

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
  private progressHandlers = new Map<ProgressToken, (progress: number, total?: number) => void>();
  private serverCapabilities: ServerCapabilities | null = null;
  private initialized = false;

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
    const response = await this.send({
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
    } as JSONRPCRequest) as InitializeResult;

    if (response.protocolVersion !== LATEST_PROTOCOL_VERSION) {
      throw new RequestFailedError(`Protocol version mismatch. Client: ${LATEST_PROTOCOL_VERSION}, Server: ${response.protocolVersion}`);
    }

    this.serverCapabilities = response.capabilities;
    this.initialized = true;
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.disconnect();
      this.transport = null;
      this.initialized = false;
      this.serverCapabilities = null;
    }
  }

  private handleMessage = async (message: JSONRPCMessage): Promise<void> => {
    // Handle responses
    if ('id' in message && message.id !== null) {
      const response = message as JSONRPCResponse | JSONRPCError;
      const id = response.id as string | number;
      const pendingRequest = this.pendingRequests.get(id);
      if (pendingRequest) {
        clearTimeout(pendingRequest.timeout);
        this.pendingRequests.delete(id);

        if ('error' in response) {
          pendingRequest.reject(McpError.fromJSON(response.error));
        } else {
          pendingRequest.resolve(response.result);
        }
        return;
      }
    }

    // Handle notifications
    if ('method' in message && !('id' in message)) {
      const notification = message as JSONRPCNotification;
      if (notification.method === 'notifications/progress' && notification.params) {
        const params = notification.params as { progressToken: ProgressToken; progress: number; total?: number };
        const handler = this.progressHandlers.get(params.progressToken);
        if (handler) {
          handler(params.progress, params.total);
        }
      }
    }

    // Pass to other handlers
    for (const handler of this.messageHandlers) {
      await handler(message);
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

    await transport.send(message);

    if ('id' in message) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(message.id);
          reject(new RequestFailedError(`Request timed out after ${this.options.requestTimeout}ms`));
        }, this.options.requestTimeout);

        this.pendingRequests.set(message.id, {
          resolve,
          reject,
          timeout,
        });
      });
    }
  }

  public onMessage(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  public offMessage(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  public onProgress(token: ProgressToken, handler: (progress: number, total?: number) => void): void {
    this.progressHandlers.set(token, handler);
  }

  public offProgress(token: ProgressToken): void {
    this.progressHandlers.delete(token);
  }

  public getServerCapabilities(): ServerCapabilities | null {
    return this.serverCapabilities;
  }

  public async callTool(name: string, params: Record<string, unknown>, progressHandler?: (progress: number, total?: number) => void): Promise<unknown> {
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
}
