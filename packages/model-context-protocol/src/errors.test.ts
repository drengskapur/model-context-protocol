import { describe, expect, it } from 'vitest';
import {
  AUTH_ERROR,
  AuthError,
  AuthenticationError,
  INTERNAL_ERROR,
  INVALID_PARAMS,
  INVALID_REQUEST,
  InternalError,
  InvalidParamsError,
  InvalidRequestError,
  METHOD_NOT_FOUND,
  McpError,
  MethodNotFoundError,
  PARSE_ERROR,
  ParseError,
  REQUEST_FAILED,
  RequestFailedError,
  SERVER_NOT_INITIALIZED,
  ServerNotInitializedError,
  TimeoutError,
  TransportError,
} from './errors';

describe('McpError', () => {
  it('should create error with code and message', () => {
    const error = new McpError(PARSE_ERROR, 'Invalid JSON');
    expect(error.code).toBe(PARSE_ERROR);
    expect(error.message).toBe('Invalid JSON');
  });

  it('should support optional data', () => {
    const data = { details: 'test' };
    const error = new McpError(PARSE_ERROR, 'Invalid JSON', data);
    expect(error.code).toBe(PARSE_ERROR);
    expect(error.message).toBe('Invalid JSON');
    expect(error.data).toBe(data);
  });

  it('should support error chaining', () => {
    const cause = new Error('Original error');
    const error = new McpError(PARSE_ERROR, 'Invalid JSON', undefined, { cause });
    expect(error.code).toBe(PARSE_ERROR);
    expect(error.message).toBe('Invalid JSON');
    expect(error.cause).toBe(cause);
  });

  it('should convert to JSON-RPC error format', () => {
    const data = { details: 'test' };
    const error = new McpError(PARSE_ERROR, 'Invalid JSON', data);
    const json = error.toJSON();
    expect(json).toEqual({
      code: PARSE_ERROR,
      message: 'Invalid JSON',
      data,
    });
  });
});

describe('Error classes', () => {
  it('ParseError should have correct code and support cause', () => {
    const cause = new Error('Original error');
    const error = new ParseError('Invalid JSON', cause);
    expect(error.code).toBe(PARSE_ERROR);
    expect(error.message).toBe('Invalid JSON');
    expect(error.cause).toBe(cause);
  });

  it('InvalidRequestError should have correct code and support cause', () => {
    const cause = new Error('Original error');
    const error = new InvalidRequestError('Bad request', cause);
    expect(error.code).toBe(INVALID_REQUEST);
    expect(error.message).toBe('Bad request');
    expect(error.cause).toBe(cause);
  });

  it('MethodNotFoundError should have correct code and support cause', () => {
    const cause = new Error('Original error');
    const error = new MethodNotFoundError('Unknown method', cause);
    expect(error.code).toBe(METHOD_NOT_FOUND);
    expect(error.message).toBe('Unknown method');
    expect(error.cause).toBe(cause);
  });

  it('InvalidParamsError should have correct code and support cause', () => {
    const cause = new Error('Original error');
    const error = new InvalidParamsError('Missing parameter', cause);
    expect(error.code).toBe(INVALID_PARAMS);
    expect(error.message).toBe('Missing parameter');
    expect(error.cause).toBe(cause);
  });

  it('InternalError should have correct code and data and cause', () => {
    const cause = new Error('Original error');
    const data = { details: 'test' };
    const error = new InternalError('Server error', data, cause);
    expect(error.code).toBe(INTERNAL_ERROR);
    expect(error.message).toBe('Server error');
    expect(error.data).toBe(data);
    expect(error.cause).toBe(cause);
  });

  it('AuthError should have correct code and support cause', () => {
    const cause = new Error('Original error');
    const error = new AuthError('Unauthorized', cause);
    expect(error.code).toBe(AUTH_ERROR);
    expect(error.message).toBe('Unauthorized');
    expect(error.cause).toBe(cause);
  });

  it('ServerNotInitializedError should have correct code and support cause', () => {
    const cause = new Error('Original error');
    const error = new ServerNotInitializedError('Not initialized', cause);
    expect(error.code).toBe(SERVER_NOT_INITIALIZED);
    expect(error.message).toBe('Not initialized');
    expect(error.cause).toBe(cause);
  });

  it('RequestFailedError should have correct code and support cause', () => {
    const cause = new Error('Original error');
    const error = new RequestFailedError('Request failed', cause);
    expect(error.code).toBe(REQUEST_FAILED);
    expect(error.message).toBe('Request failed');
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
    expect(error.message).toBe('Wrapped error');
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

    for (const error of errors) {
      expect(error).toBeInstanceOf(McpError);
      expect(error.toJSON()).toHaveProperty('code');
      expect(error.toJSON()).toHaveProperty('message');
    }
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
    } as const;

    const errorClasses: Record<keyof typeof codeMap, new (message: string) => McpError> = {
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
      const ErrorClass = errorClasses[type as keyof typeof codeMap];
      const error = new ErrorClass('Test error');
      expect(error.toJSON().code).toBe(code);
    }
  });

  it('should support error chaining with VError', () => {
    const dbError = new Error('Failed to query database');
    const apiError = new McpError(-32603, 'API error', undefined, { cause: dbError });
    expect(apiError.message).toBe('API error');
    expect(apiError.cause).toBe(dbError);
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
    const level2 = new Error('Level 2');
    const level1 = new McpError(-32603, 'Level 1', undefined, { cause: level2 });
    expect(level1.message).toBe('Level 1');
    expect(level1.cause).toBe(level2);
  });
});
