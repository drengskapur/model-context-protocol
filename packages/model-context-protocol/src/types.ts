/**
 * @file types.ts
 * @description Common type definitions used throughout the Model Context Protocol.
 * Provides shared types and type utilities.
 */

import { object, string, number, union, literal, optional, never, unknown } from 'valibot';

/**
 * Represents a unique identifier.
 * Can be either a string or a number.
 */
export type Id = string | number;

/**
 * Represents a version string.
 * Should follow semantic versioning format.
 */
export type Version = string;

/**
 * Represents a URI string.
 * Must be a valid URI format.
 */
export type Uri = string;

/**
 * Type for handling asynchronous operations that may fail.
 * Provides type safety for error handling.
 */
export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Type guard for checking if a Result is successful.
 * @param result Result to check
 * @returns Type guard assertion
 */
export function isSuccess<T, E>(
  result: Result<T, E>
): result is { success: true; value: T } {
  return result.success;
}

/**
 * Type guard for checking if a Result is a failure.
 * @param result Result to check
 * @returns Type guard assertion
 */
export function isFailure<T, E>(
  result: Result<T, E>
): result is { success: false; error: E } {
  return !result.success;
}

/**
 * Utility type to make all properties of T optional.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Utility type to make all properties of T required.
 */
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};

/**
 * Utility type to make all properties of T readonly.
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Type for a function that can be used as a predicate.
 */
export type Predicate<T> = (value: T) => boolean;

/**
 * Type for a function that transforms one type to another.
 */
export type Transformer<T, U> = (value: T) => U;

/**
 * Type for a function that validates a value.
 * Returns a Result indicating success or failure.
 */
export type Validator<T> = (value: unknown) => Result<T, Error>;

import type { Readable, Writable } from 'node:stream';

/**
 * Protocol version.
 */
export const LATEST_PROTOCOL_VERSION = '2024-02-18';

/**
 * JSON-RPC version.
 */
export const JSONRPC_VERSION = '2.0' as const;

/**
 * Request ID type.
 */
export type RequestId = string | number;

/**
 * Base request interface.
 */
export interface Request {
  /**
   * JSON-RPC version.
   */
  jsonrpc: typeof JSONRPC_VERSION;

  /**
   * Request ID.
   */
  id?: RequestId;

  /**
   * Method name.
   */
  method: string;

  /**
   * Method parameters.
   */
  params?: unknown;
}

/**
 * Base response interface.
 */
export interface Response {
  /**
   * JSON-RPC version.
   */
  jsonrpc: typeof JSONRPC_VERSION;

  /**
   * Request ID.
   */
  id: RequestId;

  /**
   * Response result.
   */
  result?: unknown;

  /**
   * Error details.
   */
  error?: {
    /**
     * Error code.
     */
    code: number;

    /**
     * Error message.
     */
    message: string;

    /**
     * Additional error data.
     */
    data?: unknown;
  };
}

/**
 * Base notification interface.
 */
export interface Notification {
  /**
   * JSON-RPC version.
   */
  jsonrpc: typeof JSONRPC_VERSION;

  /**
   * Method name.
   */
  method: string;

  /**
   * Method parameters.
   */
  params?: unknown;
}

/**
 * Base error interface.
 */
export interface Error {
  /**
   * Error code.
   */
  code: number;

  /**
   * Error message.
   */
  message: string;

  /**
   * Additional error data.
   */
  data?: unknown;
}

/**
 * Base result interface.
 */
export interface Result {
  /**
   * This result property is reserved by the protocol to allow clients and servers
   * to include custom data in the result that is not specified by the method.
   */
  result: unknown;
}

/**
 * JSON-RPC request interface.
 */
export interface JSONRPCRequest extends Request {
  /**
   * JSON-RPC version.
   */
  jsonrpc: typeof JSONRPC_VERSION;

  /**
   * Request ID.
   */
  id: RequestId;

  /**
   * Method name.
   */
  method: string;

  /**
   * Method parameters.
   */
  params?: unknown;
}

/**
 * JSON-RPC response interface.
 */
export interface JSONRPCResponse {
  /**
   * JSON-RPC version.
   */
  jsonrpc: typeof JSONRPC_VERSION;

  /**
   * Request ID.
   */
  id: RequestId;

  /**
   * Response result.
   */
  result: Result;
}

/**
 * JSON-RPC error response interface.
 */
export interface JSONRPCErrorResponse {
  /**
   * JSON-RPC version.
   */
  jsonrpc: typeof JSONRPC_VERSION;

  /**
   * Request ID.
   */
  id: RequestId;

  /**
   * Error details.
   */
  error: Error;
}

/**
 * JSON-RPC notification interface.
 */
export interface JSONRPCNotification extends Notification {
  /**
   * JSON-RPC version.
   */
  jsonrpc: typeof JSONRPC_VERSION;

  /**
   * Method name.
   */
  method: string;

  /**
   * Method parameters.
   */
  params?: unknown;
}

// Valibot schemas for validation
export const requestSchema = object({
  jsonrpc: literal(JSONRPC_VERSION),
  id: union([string(), number()]),
  method: string(),
  params: optional(unknown()),
});

export const responseSchema = object({
  jsonrpc: literal(JSONRPC_VERSION),
  id: union([string(), number()]),
  result: object({
    result: unknown(),
  }),
  method: optional(never()),
  params: optional(never()),
  error: optional(never()),
});

export const errorResponseSchema = object({
  jsonrpc: literal(JSONRPC_VERSION),
  id: union([string(), number()]),
  error: object({
    code: number(),
    message: string(),
    data: optional(unknown()),
  }),
  result: optional(never()),
  method: optional(never()),
  params: optional(never()),
});

export const notificationSchema = object({
  jsonrpc: literal(JSONRPC_VERSION),
  method: string(),
  params: optional(unknown()),
  id: optional(never()),
  result: optional(never()),
  error: optional(never()),
});

export const messageSchema = union([
  requestSchema,
  responseSchema,
  errorResponseSchema,
  notificationSchema,
]);

export interface Implementation {
  name: string;
  version: string;
}

export interface ServerCapabilities {
  experimental?: { [key: string]: unknown };
  logging?: unknown;
  tools?: {
    listChanged?: boolean;
  };
  listChanged?: boolean;
}

export interface ClientCapabilities {
  experimental?: { [key: string]: unknown };
  sampling?: unknown;
}

export interface InitializeParams {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  clientInfo: Implementation;
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: Implementation;
  instructions?: string;
}

export interface Request {
  method: string;
  params?: {
    _meta?: {
      /**
       * If specified, the caller is requesting out-of-band progress notifications for this request.
       * The value of this parameter is an opaque token that will be attached to any subsequent notifications.
       */
      progressToken?: ProgressToken;
    };
    [key: string]: unknown;
  };
}

export interface JSONRPCResult {
  /**
   * This result property is reserved by the protocol to allow clients and servers
   * to include custom data in the result that is not specified by the method.
   */
  result: unknown;
}

export interface JSONRPCRequest extends Request {
  jsonrpc: typeof JSONRPC_VERSION;
  id: RequestId;
}

export interface JSONRPCNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: {
    /**
     * This parameter name is reserved by MCP to allow clients and servers
     * to attach additional metadata to their notifications.
     */
    _meta?: { [key: string]: unknown };
    [key: string]: unknown;
  };
}

export interface JSONRPCResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: RequestId;
  result: JSONRPCResult;
}

export interface JSONRPCErrorResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: ErrorResponseId;
  error: JSONRPCError;
}

export interface JSONRPCError {
  /**
   * The error type that occurred.
   */
  code: number;
  /**
   * A message providing a short description of the error.
   */
  message: string;
  /**
   * A primitive or structured value that contains additional information about the error.
   */
  data?: unknown;
}

export type JSONRPCMessage =
  | JSONRPCRequest
  | JSONRPCResponse
  | JSONRPCNotification
  | JSONRPCErrorResponse;

export type RequestId = string | number;
export type ErrorResponseId = RequestId | null;
export type ProgressToken = string | number;

export interface McpServerConfig {
  name: string;
  version: string;
}

export interface McpMessage {
  jsonrpc: '2.0';
  id?: RequestId;
  method?: string;
  params?: {
    _meta?: {
      progressToken?: ProgressToken;
    };
  } & Record<string, unknown>;
  _meta?: {
    progressToken?: ProgressToken;
  };
  progressToken?: ProgressToken;
  result?: unknown;
  error?: JSONRPCError;
}

export interface McpError {
  code: number;
  message: string;
  data?: unknown;
}

export interface CallToolParams {
  tool: string;
  params: Record<string, unknown>;
}

export interface CallToolResult {
  result: unknown;
}

export interface McpTool {
  schema: unknown;
  handler: (params: unknown) => Promise<unknown>;
}

export interface McpTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: JSONRPCMessage): Promise<void>;
  onMessage(handler: (message: JSONRPCMessage) => Promise<void>): void;
  offMessage(handler: (message: JSONRPCMessage) => Promise<void>): void;
  close(): Promise<void>;
}

export interface TransportOptions {
  input?: Readable;
  output?: Writable;
}

// Standard JSON-RPC error codes
export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;
export const SERVER_ERROR_START = -32099;
export const SERVER_ERROR_END = -32000;

/**
 * Reference to a prompt or resource.
 */
export type Reference =
  | { type: 'ref/prompt'; name: string }
  | { type: 'ref/resource'; uriTemplate: string };

/**
 * Represents a message in a conversation.
 */
export interface Message {
  /**
   * Role of the message sender.
   */
  role: string;

  /**
   * Content of the message.
   */
  content: string;
}

/**
 * Options for message generation.
 */
export interface MessageOptions {
  /**
   * Maximum number of tokens to generate.
   */
  maxTokens?: number;

  /**
   * Temperature for controlling randomness.
   */
  temperature?: number;

  /**
   * Stop sequences that will halt generation.
   */
  stopSequences?: string[];
}

/**
 * Result of a message generation request.
 */
export interface MessageResult {
  /**
   * Generated message content.
   */
  content: string;

  /**
   * Reason why generation stopped.
   */
  stopReason?: string;
}
