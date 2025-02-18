import { describe, expect, it } from 'vitest';
import type { CallToolResult, McpError, McpMessage, McpTool } from './types';

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
