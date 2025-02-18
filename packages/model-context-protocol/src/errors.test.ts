import { describe, it, expect } from 'vitest';
import { VError } from 'verror';
import {
  McpError,
  ParseError,
  InvalidRequestError,
  MethodNotFoundError,
  InvalidParamsError,
  InternalError,
  AuthError,
  ServerNotInitializedError,
  RequestFailedError,
  AuthenticationError,
  TransportError,
  TimeoutError,
  PARSE_ERROR,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  INVALID_PARAMS,
  INTERNAL_ERROR,
  AUTH_ERROR,
  SERVER_NOT_INITIALIZED,
  REQUEST_FAILED,
} from './errors';

describe('McpError', () => {
  it('should create error with code and message', () => {
    const error = new McpError(INTERNAL_ERROR, 'Test error');
    expect(error.code).toBe(INTERNAL_ERROR);
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('McpError');
  });

  it('should support optional data', () => {
    const data = { details: 'test' };
    const error = new McpError(INTERNAL_ERROR, 'Test error', data);
    expect(error.data).toBe(data);
  });

  it('should support error chaining', () => {
    const cause = new Error('Original error');
    const error = new McpError(INTERNAL_ERROR, 'Test error', undefined, {
      cause,
    });
    expect(error.cause).toBe(cause);
  });

  it('should convert to JSON-RPC error format', () => {
    const data = { details: 'test' };
    const error = new McpError(INTERNAL_ERROR, 'Test error', data);
    const json = error.toJSON();
    expect(json).toEqual({
      code: INTERNAL_ERROR,
      message: 'Test error',
      data,
    });
  });
});

describe('Error classes', () => {
  it('ParseError should have correct code and support cause', () => {
    const cause = new Error('Parse failed');
    const error = new ParseError('Invalid JSON', cause);
    expect(error.code).toBe(PARSE_ERROR);
    expect(error.message).toBe('Invalid JSON');
    expect(error.cause).toBe(cause);
  });

  it('InvalidRequestError should have correct code and support cause', () => {
    const cause = new Error('Validation failed');
    const error = new InvalidRequestError('Missing id', cause);
    expect(error.code).toBe(INVALID_REQUEST);
    expect(error.message).toBe('Missing id');
    expect(error.cause).toBe(cause);
  });

  it('MethodNotFoundError should have correct code and support cause', () => {
    const cause = new Error('Method lookup failed');
    const error = new MethodNotFoundError('Unknown method', cause);
    expect(error.code).toBe(METHOD_NOT_FOUND);
    expect(error.message).toBe('Unknown method');
    expect(error.cause).toBe(cause);
  });

  it('InvalidParamsError should have correct code and support cause', () => {
    const cause = new Error('Validation failed');
    const error = new InvalidParamsError('Invalid type', cause);
    expect(error.code).toBe(INVALID_PARAMS);
    expect(error.message).toBe('Invalid type');
    expect(error.cause).toBe(cause);
  });

  it('InternalError should have correct code and support data and cause', () => {
    const cause = new Error('Database error');
    const data = { sql: 'SELECT *' };
    const error = new InternalError('Query failed', data, cause);
    expect(error.code).toBe(INTERNAL_ERROR);
    expect(error.message).toBe('Query failed');
    expect(error.data).toBe(data);
    expect(error.cause).toBe(cause);
  });

  it('AuthError should have correct code and support cause', () => {
    const cause = new Error('Token expired');
    const error = new AuthError('Invalid token', cause);
    expect(error.code).toBe(AUTH_ERROR);
    expect(error.message).toBe('Invalid token');
    expect(error.cause).toBe(cause);
  });

  it('ServerNotInitializedError should have correct code and support cause', () => {
    const cause = new Error('Init failed');
    const error = new ServerNotInitializedError('Not ready', cause);
    expect(error.code).toBe(SERVER_NOT_INITIALIZED);
    expect(error.message).toBe('Not ready');
    expect(error.cause).toBe(cause);
  });

  it('RequestFailedError should have correct code and support cause', () => {
    const cause = new Error('Network error');
    const error = new RequestFailedError('Request timeout', cause);
    expect(error.code).toBe(REQUEST_FAILED);
    expect(error.message).toBe('Request timeout');
    expect(error.cause).toBe(cause);
  });

  it('AuthenticationError should have correct code and support cause', () => {
    const cause = new Error('Authentication failed');
    const error = new AuthenticationError('Invalid credentials', cause);
    expect(error.code).toBe(401);
    expect(error.message).toBe('Invalid credentials');
    expect(error.cause).toBe(cause);
  });

  it('TransportError should have correct code and support cause', () => {
    const cause = new Error('Transport error');
    const error = new TransportError('Transport failed', cause);
    expect(error.code).toBe(500);
    expect(error.message).toBe('Transport failed');
    expect(error.cause).toBe(cause);
  });

  it('TimeoutError should have correct code and support cause', () => {
    const cause = new Error('Timeout error');
    const error = new TimeoutError('Timeout exceeded', cause);
    expect(error.code).toBe(504);
    expect(error.message).toBe('Timeout exceeded');
    expect(error.cause).toBe(cause);
  });
});

describe('Error Handling', () => {
  it('should chain errors correctly', () => {
    const cause = new Error('Original error');
    const error = new McpError(-32603, 'Wrapped error', undefined, { cause });

    expect(error.cause).toBe(cause);
    expect(VError.fullStack(error)).toContain('Original error');
  });

  it('should include error metadata', () => {
    const data = { details: 'test' };
    const error = new McpError(-32603, 'Test error', data);
    const json = error.toJSON();

    expect(json.code).toBe(-32603);
    expect(json.message).toBe('Test error');
    expect(json.data).toBe(data);
  });

  it('should handle specific error types', () => {
    const errors = [
      new ParseError('Invalid JSON'),
      new InvalidRequestError('Bad request'),
      new MethodNotFoundError('Unknown method'),
      new InvalidParamsError('Missing parameter'),
      new InternalError('Server error'),
      new AuthError('Unauthorized'),
      new ServerNotInitializedError('Not initialized'),
      new RequestFailedError('Request failed'),
      new AuthenticationError('Invalid credentials'),
      new TransportError('Transport failed'),
      new TimeoutError('Timeout exceeded'),
    ];

    errors.forEach((error) => {
      expect(error).toBeInstanceOf(McpError);
      expect(error.toJSON()).toHaveProperty('code');
      expect(error.toJSON()).toHaveProperty('message');
    });
  });

  it('should preserve error codes', () => {
    const codeMap = {
      ParseError: -32700,
      InvalidRequestError: -32600,
      MethodNotFoundError: -32601,
      InvalidParamsError: -32602,
      InternalError: -32603,
      AuthError: -32401,
      ServerNotInitializedError: -32002,
      RequestFailedError: -32001,
      AuthenticationError: 401,
      TransportError: 500,
      TimeoutError: 504,
    };

    const errorClasses = {
      ParseError,
      InvalidRequestError,
      MethodNotFoundError,
      InvalidParamsError,
      InternalError,
      AuthError,
      ServerNotInitializedError,
      RequestFailedError,
      AuthenticationError,
      TransportError,
      TimeoutError,
    };

    for (const [type, code] of Object.entries(codeMap)) {
      const error = new errorClasses[type]('Test error');
      expect(error.toJSON().code).toBe(code);
    }
  });

  it('should support error chaining with VError', () => {
    const originalError = new Error('Database error');
    const dbError = new VError(originalError, 'Failed to query database');
    const apiError = new McpError(-32603, 'API error', undefined, {
      cause: dbError,
    });

    const stack = VError.fullStack(apiError);
    expect(stack).toContain('Database error');
    expect(stack).toContain('Failed to query database');
    expect(stack).toContain('API error');
  });

  it('should handle error info', () => {
    const error = new McpError(-32603, 'Test error', {
      code: 'TEST_ERROR',
      details: { foo: 'bar' },
    });

    const json = error.toJSON();
    expect(json.data).toEqual({
      code: 'TEST_ERROR',
      details: { foo: 'bar' },
    });
  });

  it('should handle nested errors', () => {
    const level3 = new Error('Level 3');
    const level2 = new VError(level3, 'Level 2');
    const level1 = new McpError(-32603, 'Level 1', undefined, {
      cause: level2,
    });

    const stack = VError.fullStack(level1);
    expect(stack).toContain('Level 1');
    expect(stack).toContain('Level 2');
    expect(stack).toContain('Level 3');
  });
});
