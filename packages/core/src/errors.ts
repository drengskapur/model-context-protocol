/**
 * Base error class for MCP errors.
 */
export class McpError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(messageOrCode: string | number, messageOrData?: string | unknown, data?: unknown) {
    let message: string;
    let code: number;
    let errorData: unknown;

    if (typeof messageOrCode === 'string') {
      message = messageOrCode;
      code = INTERNAL_ERROR;
      errorData = messageOrData;
    } else {
      code = messageOrCode;
      message = typeof messageOrData === 'string' ? messageOrData : 'Unknown error';
      errorData = data;
    }

    super(message);
    this.code = code;
    this.data = errorData;
    this.name = 'McpError';
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert the error to a JSON-RPC error object.
   */
  toJSON() {
    const result: { code: number; message: string; data?: unknown } = {
      code: this.code,
      message: this.message,
    };
    if (this.data !== undefined) {
      result.data = this.data;
    }
    return result;
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

// Custom error codes
export const SERVER_NOT_INITIALIZED = -32002;
export const REQUEST_FAILED = -32003;

/**
 * Parse error indicates that the JSON sent is not a valid JSON-RPC object.
 */
export class ParseError extends McpError {
  constructor(message = 'Parse error') {
    super(PARSE_ERROR, message);
    this.name = 'ParseError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Invalid request error indicates that the JSON sent is not a valid Request object.
 */
export class InvalidRequestError extends McpError {
  constructor(message = 'Invalid request') {
    super(INVALID_REQUEST, message);
    this.name = 'InvalidRequestError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Method not found error indicates that the method does not exist / is not available.
 */
export class MethodNotFoundError extends McpError {
  constructor(message = 'Method not found') {
    super(METHOD_NOT_FOUND, message);
    this.name = 'MethodNotFoundError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Invalid params error indicates that invalid method parameters were sent.
 */
export class InvalidParamsError extends McpError {
  constructor(message = 'Invalid params') {
    super(INVALID_PARAMS, message);
    this.name = 'InvalidParamsError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Internal error indicates that an internal JSON-RPC error occurred.
 */
export class InternalError extends McpError {
  constructor(message = 'Internal error', data?: unknown) {
    super(INTERNAL_ERROR, message, data);
    this.name = 'InternalError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Server not initialized error indicates that the server has not been initialized.
 */
export class ServerNotInitializedError extends McpError {
  constructor(message = 'Server not initialized') {
    super(SERVER_NOT_INITIALIZED, message);
    this.name = 'ServerNotInitializedError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Request failed error indicates that a request failed for some reason.
 */
export class RequestFailedError extends McpError {
  constructor(message = 'Request failed') {
    super(REQUEST_FAILED, message);
    this.name = 'RequestFailedError';
    Error.captureStackTrace(this, this.constructor);
  }
}
