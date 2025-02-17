import {
  type InitializeResult,
  type JSONRPCMessage,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type JSONRPCErrorResponse,
  type JSONRPCNotification,
  type Result,
  type RequestId,
  JSONRPC_VERSION,
  LATEST_PROTOCOL_VERSION,
} from './types.js';

import type { McpTransport } from './transport';
import type { BaseSchema, Output } from 'valibot';
import { parse, object, string } from 'valibot';
import {
  InvalidParamsError,
  InvalidRequestError,
  McpError,
  MethodNotFoundError,
  ParseError,
  ServerNotInitializedError,
} from './errors.js';

const initializeParamsSchema = object({
  protocolVersion: string(),
});

export interface ServerOptions {
  name: string;
  version: string;
  capabilities?: Record<string, unknown>;
}

export class Server {
  private readonly implementation: { name: string; version: string };
  private readonly capabilities: Record<string, unknown>;
  private initialized = false;
  private tools = new Map<
    string,
    {
      schema: BaseSchema<unknown>;
      handler: (args: unknown) => Promise<unknown>;
    }
  >();
  private transport: McpTransport | null = null;

  constructor(options: ServerOptions) {
    this.implementation = {
      name: options.name,
      version: options.version,
    };
    this.capabilities = options.capabilities || {};
  }

  public tool<T extends BaseSchema<unknown>>(
    name: string,
    schema: T,
    handler: (params: Output<T>) => string | Promise<string>
  ): void {
    this.tools.set(name, {
      schema,
      handler: async (params: unknown) => handler(parse(schema, params)),
    });
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
            error instanceof McpError ? error : new McpError(-32603, 'Internal error', error instanceof Error ? error.message : String(error))
          )
        );
      }
    }
  };

  public handleMessage(
    message: JSONRPCMessage
  ): Promise<JSONRPCResponse | JSONRPCErrorResponse | undefined> {
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
  ): Promise<JSONRPCResponse | JSONRPCErrorResponse | undefined> {
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

    return this.handleToolCall(message);
  }

  private handleToolCall(
    message: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCErrorResponse | undefined> {
    const tool = this.tools.get(message.method);
    if (!tool) {
      return Promise.resolve(
        this.createErrorResponse(message.id, new MethodNotFoundError())
      );
    }

    try {
      const result = parse(tool.schema, message.params);
      return tool.handler(result).then((toolResult) => ({
        jsonrpc: JSONRPC_VERSION,
        id: message.id,
        result: { value: toolResult } as Result,
      }));
    } catch (error) {
      return Promise.resolve(
        this.createErrorResponse(message.id, new InvalidParamsError(error instanceof Error ? error.message : String(error)))
      );
    }
  }

  public handleInitialize(
    request: JSONRPCRequest
  ): JSONRPCResponse | JSONRPCErrorResponse {
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
          new InvalidRequestError(`Protocol version mismatch. Server: ${LATEST_PROTOCOL_VERSION}, Client: ${params.protocolVersion}`)
        );
      }

      this.initialized = true;
      const result: InitializeResult & Result = {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: this.implementation.name,
          version: this.implementation.version,
        },
        capabilities: this.capabilities,
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

  private createErrorResponse(
    id: RequestId | null,
    error: McpError
  ): JSONRPCErrorResponse {
    // Convert null to a default RequestId value
    const responseId: RequestId = id ?? 0;

    return {
      jsonrpc: JSONRPC_VERSION,
      id: responseId,
      error: error.toJSON(),
    };
  }
}

export interface McpServerOptions {
  name: string;
  version: string;
}

export class McpServer {
  private server: Server;

  constructor(options: McpServerOptions) {
    this.server = new Server(options);
  }

  public tool<T extends BaseSchema<unknown>>(
    name: string,
    schema: T,
    handler: (params: Output<T>) => string | Promise<string>
  ): void {
    this.server.tool(name, schema, handler);
  }

  public connect(transport: McpTransport): Promise<void> {
    return this.server.connect(transport);
  }

  public async disconnect(): Promise<void> {
    if (this.server['transport']) {
      await this.server['transport'].disconnect();
    }
  }
}
