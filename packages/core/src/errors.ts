/**
 * Base error class for MCP errors.
 */
export class McpError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
    this.name = 'McpError';
  }

  /**
   * Convert the error to a JSON-RPC error object.
   */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }

  /**
   * Create an error from a JSON-RPC error object.
   */
  static fromJSON(error: { code: number; message: string; data?: unknown }) {
    return new McpError(error.code, error.message, error.data);
  }
}

/**
 * Error codes as defined in the JSON-RPC 2.0 specification.
 */
export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

/**
 * Parse error indicates that the JSON sent is not a valid JSON-RPC object.
 */
export class ParseError extends McpError {
  constructor(message = 'Parse error') {
    super(PARSE_ERROR, message);
    this.name = 'ParseError';
  }
}

/**
 * Invalid request error indicates that the JSON sent is not a valid Request object.
 */
export class InvalidRequestError extends McpError {
  constructor(message = 'Invalid request') {
    super(INVALID_REQUEST, message);
    this.name = 'InvalidRequestError';
  }
}

/**
 * Method not found error indicates that the method does not exist / is not available.
 */
export class MethodNotFoundError extends McpError {
  constructor(message = 'Method not found') {
    super(METHOD_NOT_FOUND, message);
    this.name = 'MethodNotFoundError';
  }
}

/**
 * Invalid params error indicates that invalid method parameters were sent.
 */
export class InvalidParamsError extends McpError {
  constructor(message = 'Invalid parameters') {
    super(INVALID_PARAMS, message);
    this.name = 'InvalidParamsError';
  }
}

/**
 * Internal error indicates that there was an internal JSON-RPC error.
 */
export class InternalError extends McpError {
  constructor(data?: unknown) {
    super(INTERNAL_ERROR, 'Internal error', data);
    this.name = 'InternalError';
  }
}

/**
 * Server not initialized error indicates that the server has not been initialized.
 */
export class ServerNotInitializedError extends McpError {
  constructor(message = 'Server not initialized') {
    super(INVALID_REQUEST, message);
    this.name = 'ServerNotInitializedError';
  }
}

/**
 * Request failed error indicates that a request to the server failed.
 */
export class RequestFailedError extends McpError {
  constructor(message: string) {
    super(-32000, message);
    this.name = 'RequestFailedError';
  }
}
