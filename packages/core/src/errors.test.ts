import { describe, it, expect } from 'vitest';
import {
  McpError,
  ParseError,
  InvalidRequestError,
  MethodNotFoundError,
  InvalidParamsError,
  ServerNotInitializedError,
  RequestFailedError,
} from './errors';

describe('Error Handling', () => {
  describe('McpError', () => {
    it('should create base error with correct properties', () => {
      const error = new McpError('Test error');
      expect(error.name).toBe('McpError');
      expect(error.message).toBe('Test error');
      expect(error instanceof Error).toBe(true);
    });

    it('should serialize to JSON correctly', () => {
      const error = new McpError('Test error');
      const json = error.toJSON();
      expect(json).toEqual({
        code: -32603,
        message: 'Test error',
      });
    });
  });

  describe('ParseError', () => {
    it('should create parse error with correct code', () => {
      const error = new ParseError('Invalid JSON');
      expect(error.name).toBe('ParseError');
      expect(error.message).toBe('Invalid JSON');
      const json = error.toJSON();
      expect(json.code).toBe(-32700);
    });

    it('should use default message if none provided', () => {
      const error = new ParseError();
      expect(error.message).toBe('Parse error');
    });
  });

  describe('InvalidRequestError', () => {
    it('should create invalid request error with correct code', () => {
      const error = new InvalidRequestError('Bad request');
      expect(error.name).toBe('InvalidRequestError');
      expect(error.message).toBe('Bad request');
      const json = error.toJSON();
      expect(json.code).toBe(-32600);
    });

    it('should use default message if none provided', () => {
      const error = new InvalidRequestError();
      expect(error.message).toBe('Invalid request');
    });
  });

  describe('MethodNotFoundError', () => {
    it('should create method not found error with correct code', () => {
      const error = new MethodNotFoundError('Unknown method');
      expect(error.name).toBe('MethodNotFoundError');
      expect(error.message).toBe('Unknown method');
      const json = error.toJSON();
      expect(json.code).toBe(-32601);
    });

    it('should use default message if none provided', () => {
      const error = new MethodNotFoundError();
      expect(error.message).toBe('Method not found');
    });
  });

  describe('InvalidParamsError', () => {
    it('should create invalid params error with correct code', () => {
      const error = new InvalidParamsError('Missing required parameter');
      expect(error.name).toBe('InvalidParamsError');
      expect(error.message).toBe('Missing required parameter');
      const json = error.toJSON();
      expect(json.code).toBe(-32602);
    });

    it('should use default message if none provided', () => {
      const error = new InvalidParamsError();
      expect(error.message).toBe('Invalid params');
    });
  });

  describe('ServerNotInitializedError', () => {
    it('should create server not initialized error with correct code', () => {
      const error = new ServerNotInitializedError('Server not ready');
      expect(error.name).toBe('ServerNotInitializedError');
      expect(error.message).toBe('Server not ready');
      const json = error.toJSON();
      expect(json.code).toBe(-32002);
    });

    it('should use default message if none provided', () => {
      const error = new ServerNotInitializedError();
      expect(error.message).toBe('Server not initialized');
    });
  });

  describe('RequestFailedError', () => {
    it('should create request failed error with correct code', () => {
      const error = new RequestFailedError('Network error');
      expect(error.name).toBe('RequestFailedError');
      expect(error.message).toBe('Network error');
      const json = error.toJSON();
      expect(json.code).toBe(-32003);
    });

    it('should use default message if none provided', () => {
      const error = new RequestFailedError();
      expect(error.message).toBe('Request failed');
    });
  });

  describe('Error Inheritance', () => {
    it('should maintain proper error inheritance chain', () => {
      const errors = [
        new ParseError(),
        new InvalidRequestError(),
        new MethodNotFoundError(),
        new InvalidParamsError(),
        new ServerNotInitializedError(),
        new RequestFailedError(),
      ];

      for (const error of errors) {
        expect(error instanceof McpError).toBe(true);
        expect(error instanceof Error).toBe(true);
      }
    });
  });

  describe('Error Stack Traces', () => {
    it('should preserve stack traces', () => {
      const error = new McpError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack?.includes('Test error')).toBe(true);
    });

    it('should include error name in stack trace', () => {
      const error = new ParseError('Test parse error');
      expect(error.stack?.includes('ParseError')).toBe(true);
    });
  });

  describe('Error Code Uniqueness', () => {
    it('should have unique error codes for each error type', () => {
      const errorCodes = new Set();
      const errors = [
        new ParseError(),
        new InvalidRequestError(),
        new MethodNotFoundError(),
        new InvalidParamsError(),
        new ServerNotInitializedError(),
        new RequestFailedError(),
      ];

      for (const error of errors) {
        const code = error.toJSON().code;
        expect(errorCodes.has(code)).toBe(false);
        errorCodes.add(code);
      }
    });
  });

  describe('Error Message Formatting', () => {
    it('should handle special characters in messages', () => {
      const message = 'Error with special chars: \n\t"quotes" and \\backslashes\\';
      const error = new McpError(message);
      const json = error.toJSON();
      expect(json.message).toBe(message);
    });

    it('should handle empty messages', () => {
      const error = new McpError('');
      const json = error.toJSON();
      expect(json.message).toBe('');
    });

    it('should handle long messages', () => {
      const longMessage = 'a'.repeat(1000);
      const error = new McpError(longMessage);
      const json = error.toJSON();
      expect(json.message).toBe(longMessage);
    });
  });

  describe('Error Serialization', () => {
    it('should maintain data consistency when serializing', () => {
      const originalError = new McpError('Test error');
      const json = originalError.toJSON();
      const serialized = JSON.stringify(json);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized).toEqual({
        code: originalError.toJSON().code,
        message: originalError.message,
      });
    });

    it('should handle nested error information', () => {
      const innerError = new Error('Inner error');
      const outerError = new McpError(`Outer error: ${innerError.message}`);
      const json = outerError.toJSON();
      
      expect(json.message).toBe('Outer error: Inner error');
      expect(json.code).toBe(-32603);
    });
  });
});
