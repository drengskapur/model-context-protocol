/**
 * @file types.test.ts
 * @description Test suite for type utility functions.
 * Contains unit tests for type guards and utility functions.
 */

import { describe, expect, it } from 'vitest';
import type { CallToolResult, McpError, McpMessage, McpTool } from './types';
import { isFailure, isSuccess } from './types';
import type { Result } from './types';

describe('MCP Types', () => {
  it('should validate McpMessage structure', () => {
    const message: McpMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
      params: {
        foo: 'bar',
      },
    };

    expect(message.jsonrpc).toBe('2.0');
    expect(message.id).toBe(1);
    expect(message.method).toBe('test');
    expect(message.params).toEqual({ foo: 'bar' });
  });

  it('should validate McpError structure', () => {
    const error: McpError = {
      code: -32700,
      message: 'Parse error',
      data: { line: 1, column: 10 },
    };

    expect(error.code).toBe(-32700);
    expect(error.message).toBe('Parse error');
    expect(error.data).toEqual({ line: 1, column: 10 });
  });

  it('should validate CallToolResult structure', () => {
    const result: CallToolResult = {
      result: 'Success',
    };

    expect(result.result).toBe('Success');
  });

  it('should validate McpTool structure', async () => {
    const tool: McpTool = {
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      },
      handler: async () => 'Success',
    };

    expect(tool.schema).toHaveProperty('type', 'object');
    const result = await tool.handler({});
    expect(result).toBe('Success');
  });
});

describe('Type Utilities', () => {
  describe('isSuccess', () => {
    it('should return true for successful results', () => {
      const result: Result<number> = {
        success: true,
        value: 42,
      };
      expect(isSuccess(result)).toBe(true);
    });

    it('should return false for failed results', () => {
      const result: Result<number> = {
        success: false,
        error: { code: -1, message: 'Test error' },
      };
      expect(isSuccess(result)).toBe(false);
    });

    it('should properly narrow the type', () => {
      const result: Result<number> = {
        success: true,
        value: 42,
      };

      if (isSuccess(result)) {
        // TypeScript should know this is safe
        expect(result.value).toBe(42);
      }
    });
  });

  describe('isFailure', () => {
    it('should return true for failed results', () => {
      const result: Result<number> = {
        success: false,
        error: { code: -1, message: 'Test error' },
      };
      expect(isFailure(result)).toBe(true);
    });

    it('should return false for successful results', () => {
      const result: Result<number> = {
        success: true,
        value: 42,
      };
      expect(isFailure(result)).toBe(false);
    });

    it('should properly narrow the type', () => {
      const error = { code: -1, message: 'Test error' };
      const result: Result<number> = {
        success: false,
        error,
      };

      if (isFailure(result)) {
        // TypeScript should know this is safe
        expect(result.error).toBe(error);
      }
    });
  });

  describe('Result type', () => {
    it('should work with different value types', () => {
      const stringResult: Result<string> = {
        success: true,
        value: 'test',
      };
      expect(isSuccess(stringResult)).toBe(true);

      const numberResult: Result<number> = {
        success: true,
        value: 42,
      };
      expect(isSuccess(numberResult)).toBe(true);

      const objectResult: Result<{ foo: string }> = {
        success: true,
        value: { foo: 'bar' },
      };
      expect(isSuccess(objectResult)).toBe(true);
    });

    it('should work with different error types', () => {
      const standardError: Result<string> = {
        success: false,
        error: { code: -1, message: 'Standard error' },
      };
      expect(isFailure(standardError)).toBe(true);

      const customError: Result<string, string> = {
        success: false,
        error: 'Custom error',
      };
      expect(isFailure(customError)).toBe(true);

      const objectError: Result<string, { code: number; message: string }> = {
        success: false,
        error: { code: 404, message: 'Not found' },
      };
      expect(isFailure(objectError)).toBe(true);
    });
  });
});
