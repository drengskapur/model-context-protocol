import { VError } from 'verror';

/**
 * @file errors.ts
 * @description Custom error classes for the Model Context Protocol.
 * Defines specific error types for various failure scenarios.
 */

/**
 * Base error class for MCP errors.
 */
export class McpError extends VError {
  public readonly code: number;
  public readonly data?: unknown;

  constructor(
    code: number,
    message: string,
    data?: unknown,
    options?: { cause?: Error }
  ) {
    super({ name: 'McpError', cause: options?.cause }, message);
    this.code = code;
    this.data = data;
  }

  toJSON(): { code: number; message: string; data?: unknown } {
    return {
      code: this.code,
      message: this.message,
      ...(this.data !== undefined && { data: this.data }),
    };
  }
}

// JSON-RPC 2.0 error codes
export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;
export const AUTH_ERROR = -32401;
export const SERVER_NOT_INITIALIZED = -32002;
export const REQUEST_FAILED = -32001;

/**
 * Error thrown when parsing JSON fails.
 */
export class ParseError extends McpError {
  constructor(message: string, cause?: Error) {
    super(PARSE_ERROR, message, undefined, { cause });
  }
}

/**
 * Error thrown when the request is invalid.
 */
export class InvalidRequestError extends McpError {
  constructor(message: string, cause?: Error) {
    super(INVALID_REQUEST, message, undefined, { cause });
  }
}

/**
 * Error thrown when the requested method is not found.
 */
export class MethodNotFoundError extends McpError {
  constructor(message: string, cause?: Error) {
    super(METHOD_NOT_FOUND, message, undefined, { cause });
  }
}

/**
 * Error thrown when the parameters are invalid.
 */
export class InvalidParamsError extends McpError {
  constructor(message: string, cause?: Error) {
    super(INVALID_PARAMS, message, undefined, { cause });
  }
}

/**
 * Error thrown when an internal error occurs.
 */
export class InternalError extends McpError {
  constructor(message: string, data?: unknown, cause?: Error) {
    super(INTERNAL_ERROR, message, data, { cause });
  }
}

/**
 * Error thrown when authentication fails.
 */
export class AuthError extends McpError {
  constructor(message: string, cause?: Error) {
    super(AUTH_ERROR, message, undefined, { cause });
  }
}

/**
 * Error thrown when the server is not initialized.
 */
export class ServerNotInitializedError extends McpError {
  constructor(message: string, cause?: Error) {
    super(SERVER_NOT_INITIALIZED, message, undefined, { cause });
  }
}

/**
 * Error thrown when a request fails.
 */
export class RequestFailedError extends McpError {
  constructor(message: string, cause?: Error) {
    super(REQUEST_FAILED, message, undefined, { cause });
  }
}
