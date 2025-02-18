/**
 * Base error class for Model Context Protocol errors.
 * All MCP errors extend from this class.
 */
export class McpError extends Error {
  /** Error code */
  readonly code: number;
  /** Optional error data */
  readonly data?: unknown;

  /**
   * Creates a new McpError instance.
   * @param messageOrCode Error message or code
   * @param messageOrData Error message or data
   * @param data Additional error data
   */
  constructor(
    messageOrCode: string | number,
    messageOrData?: string | unknown,
    data?: unknown
  ) {
    let message: string;
    let code: number;
    let errorData: unknown;

    if (typeof messageOrCode === 'string') {
      message = messageOrCode;
      code = INTERNAL_ERROR;
      errorData = messageOrData;
    } else {
      code = messageOrCode;
      message =
        typeof messageOrData === 'string' ? messageOrData : 'Unknown error';
      errorData = data;
    }

    super(message);
    this.code = code;
    this.data = errorData;
    this.name = 'McpError';
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Converts the error to a JSON-RPC error object.
   * @returns JSON-RPC error object
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
   * Creates an McpError instance from a JSON-RPC error object.
   * @param error JSON-RPC error object
   * @returns McpError instance
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
 * Error thrown when a JSON-RPC parse error occurs.
 */
export class ParseError extends McpError {
  /**
   * Creates a new ParseError instance.
   * @param message Error message
   */
  constructor(message = 'Parse error') {
    super(PARSE_ERROR, message);
    this.name = 'ParseError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when an invalid JSON-RPC request is received.
 */
export class InvalidRequestError extends McpError {
  /**
   * Creates a new InvalidRequestError instance.
   * @param message Error message
   */
  constructor(message = 'Invalid request') {
    super(INVALID_REQUEST, message);
    this.name = 'InvalidRequestError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when a requested method is not found.
 */
export class MethodNotFoundError extends McpError {
  /**
   * Creates a new MethodNotFoundError instance.
   * @param message Error message
   */
  constructor(message = 'Method not found') {
    super(METHOD_NOT_FOUND, message);
    this.name = 'MethodNotFoundError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when invalid parameters are provided.
 */
export class InvalidParamsError extends McpError {
  /**
   * Creates a new InvalidParamsError instance.
   * @param message Error message
   */
  constructor(message = 'Invalid params') {
    super(INVALID_PARAMS, message);
    this.name = 'InvalidParamsError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when an internal JSON-RPC error occurs.
 */
export class InternalError extends McpError {
  /**
   * Creates a new InternalError instance.
   * @param message Error message
   * @param data Additional error data
   */
  constructor(message = 'Internal error', data?: unknown) {
    super(INTERNAL_ERROR, message, data);
    this.name = 'InternalError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when the server is not initialized.
 */
export class ServerNotInitializedError extends McpError {
  /**
   * Creates a new ServerNotInitializedError instance.
   * @param message Error message
   */
  constructor(message = 'Server not initialized') {
    super(SERVER_NOT_INITIALIZED, message);
    this.name = 'ServerNotInitializedError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when a request fails.
 */
export class RequestFailedError extends McpError {
  /**
   * Creates a new RequestFailedError instance.
   * @param message Error message
   */
  constructor(message = 'Request failed') {
    super(REQUEST_FAILED, message);
    this.name = 'RequestFailedError';
    Error.captureStackTrace(this, this.constructor);
  }
}
