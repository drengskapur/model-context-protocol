import { describe, expect, it } from 'vitest';
import { ReadBuffer, serializeMessage } from './buffer.js';
import type { JSONRPCMessage } from './schema.js';

describe('ReadBuffer', () => {
  it('should append string data to buffer', () => {
    const buffer = new ReadBuffer();
    buffer.append('hello');
    expect(buffer['_buffer']).toBe('hello');
  });

  it('should append Buffer data to buffer', () => {
    const buffer = new ReadBuffer();
    buffer.append(Buffer.from('hello'));
    expect(buffer['_buffer']).toBe('hello');
  });

  it('should read complete message from buffer', () => {
    const buffer = new ReadBuffer();
    buffer.append('hello\nworld');
    expect(buffer.read()).toBe('hello');
    expect(buffer['_buffer']).toBe('world');
  });

  it('should return undefined when no complete message is available', () => {
    const buffer = new ReadBuffer();
    buffer.append('hello');
    expect(buffer.read()).toBeUndefined();
    expect(buffer['_buffer']).toBe('hello');
  });

  it('should handle multiple messages', () => {
    const buffer = new ReadBuffer();
    buffer.append('hello\nworld\n');
    expect(buffer.read()).toBe('hello');
    expect(buffer.read()).toBe('world');
    expect(buffer.read()).toBeUndefined();
  });

  it('should clear buffer', () => {
    const buffer = new ReadBuffer();
    buffer.append('hello\nworld');
    buffer.clear();
    expect(buffer['_buffer']).toBe('');
  });
});

describe('serializeMessage', () => {
  it('should serialize JSON-RPC message with newline', () => {
    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      method: 'test',
      params: { foo: 'bar' },
    };
    expect(serializeMessage(message)).toBe(
      '{"jsonrpc":"2.0","method":"test","params":{"foo":"bar"}}\n'
    );
  });

  it('should serialize JSON-RPC request with id', () => {
    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
      params: { foo: 'bar' },
    };
    expect(serializeMessage(message)).toBe(
      '{"jsonrpc":"2.0","id":1,"method":"test","params":{"foo":"bar"}}\n'
    );
  });

  it('should serialize JSON-RPC response', () => {
    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      result: { value: 'success' },
    };
    expect(serializeMessage(message)).toBe(
      '{"jsonrpc":"2.0","id":1,"result":{"value":"success"}}\n'
    );
  });

  it('should serialize JSON-RPC error', () => {
    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32600,
        message: 'Invalid request',
      },
    };
    expect(serializeMessage(message)).toBe(
      '{"jsonrpc":"2.0","id":1,"error":{"code":-32600,"message":"Invalid request"}}\n'
    );
  });
});
