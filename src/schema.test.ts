import { parse } from 'valibot';
import { describe, expect, it } from 'vitest';
import {
  type JSONRPCNotification,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type JSONRPCErrorResponse,
  JSONRPC_VERSION,
  jsonRpcMessageSchema,
} from './types.js';

describe('JSON-RPC Message Schema', () => {
  describe('Request Messages', () => {
    it('validates a basic request', () => {
      const request: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        method: 'test',
        params: { foo: 'bar' },
      };
      expect(() => parse(jsonRpcMessageSchema, request)).not.toThrow();
    });

    it('validates request with string id', () => {
      const request: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: 'abc-123',
        method: 'test',
        params: {},
      };
      expect(() => parse(jsonRpcMessageSchema, request)).not.toThrow();
    });

    it('validates request with progress token', () => {
      const request: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        method: 'test',
        params: {
          _meta: {
            progressToken: 'progress-123',
          },
          data: 'test',
        },
      };
      expect(() => parse(jsonRpcMessageSchema, request)).not.toThrow();
    });

    it('validates request with numeric progress token', () => {
      const request: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        method: 'test',
        params: {
          _meta: {
            progressToken: 123,
          },
        },
      };
      expect(() => parse(jsonRpcMessageSchema, request)).not.toThrow();
    });

    it('validates request without params', () => {
      const request: JSONRPCRequest = {
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        method: 'test',
      };
      expect(() => parse(jsonRpcMessageSchema, request)).not.toThrow();
    });
  });

  describe('Notification Messages', () => {
    it('validates a basic notification', () => {
      const notification: JSONRPCNotification = {
        jsonrpc: JSONRPC_VERSION,
        method: 'notify',
        params: { message: 'test' },
      };
      expect(() => parse(jsonRpcMessageSchema, notification)).not.toThrow();
    });

    it('validates notification with metadata', () => {
      const notification: JSONRPCNotification = {
        jsonrpc: JSONRPC_VERSION,
        method: 'notify',
        params: {
          _meta: {
            timestamp: new Date().toISOString(),
          },
          data: 'test',
        },
      };
      expect(() => parse(jsonRpcMessageSchema, notification)).not.toThrow();
    });

    it('validates notification without params', () => {
      const notification: JSONRPCNotification = {
        jsonrpc: JSONRPC_VERSION,
        method: 'notify',
      };
      expect(() => parse(jsonRpcMessageSchema, notification)).not.toThrow();
    });
  });

  describe('Response Messages', () => {
    it('validates successful response', () => {
      const response: JSONRPCResponse = {
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        result: { data: 'test' },
      };
      expect(() => parse(jsonRpcMessageSchema, response)).not.toThrow();
    });

    it('validates response with metadata', () => {
      const response: JSONRPCResponse = {
        jsonrpc: JSONRPC_VERSION,
        id: 'abc-123',
        result: {
          _meta: {
            duration: 123,
            cache: 'hit',
          },
          data: 'test',
        },
      };
      expect(() => parse(jsonRpcMessageSchema, response)).not.toThrow();
    });

    it('validates response with empty result', () => {
      const response: JSONRPCResponse = {
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        result: {},
      };
      expect(() => parse(jsonRpcMessageSchema, response)).not.toThrow();
    });
  });

  describe('Error Messages', () => {
    it('validates basic error', () => {
      const error: JSONRPCErrorResponse = {
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        error: {
          code: -32700,
          message: 'Parse error',
        },
      };
      expect(() => parse(jsonRpcMessageSchema, error)).not.toThrow();
    });

    it('validates error with data', () => {
      const error: JSONRPCErrorResponse = {
        jsonrpc: JSONRPC_VERSION,
        id: 'abc-123',
        error: {
          code: -32600,
          message: 'Invalid Request',
          data: {
            line: 1,
            column: 10,
            source: 'validation',
          },
        },
      };
      expect(() => parse(jsonRpcMessageSchema, error)).not.toThrow();
    });

    it('validates error with null id', () => {
      const error: JSONRPCErrorResponse = {
        jsonrpc: JSONRPC_VERSION,
        id: null,
        error: {
          code: -32700,
          message: 'Parse error',
        },
      };
      expect(() => parse(jsonRpcMessageSchema, error)).not.toThrow();
    });
  });

  describe('Invalid Messages', () => {
    it('rejects message with wrong version', () => {
      const message = {
        jsonrpc: '1.0',
        id: 1,
        method: 'test',
      };
      expect(() => parse(jsonRpcMessageSchema, message)).toThrow();
    });

    it('rejects request without method', () => {
      const message = {
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        params: {},
      };
      expect(() => parse(jsonRpcMessageSchema, message)).toThrow();
    });

    it('rejects response without id', () => {
      const message = {
        jsonrpc: JSONRPC_VERSION,
        result: {},
      };
      expect(() => parse(jsonRpcMessageSchema, message)).toThrow();
    });

    it('rejects error without code', () => {
      const message = {
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        error: {
          message: 'Test error',
        },
      };
      expect(() => parse(jsonRpcMessageSchema, message)).toThrow();
    });

    it('rejects error without message', () => {
      const message = {
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        error: {
          code: -32700,
        },
      };
      expect(() => parse(jsonRpcMessageSchema, message)).toThrow();
    });

    it('rejects message with both result and error', () => {
      const message = {
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        result: {},
        error: {
          code: -32700,
          message: 'Test error',
        },
      };
      expect(() => parse(jsonRpcMessageSchema, message)).toThrow();
    });

    it('rejects message with invalid progress token type', () => {
      const message = {
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        method: 'test',
        params: {
          _meta: {
            progressToken: true, // boolean is not allowed
          },
        },
      };
      expect(() => parse(jsonRpcMessageSchema, message)).toThrow();
    });

    it('rejects message with invalid id type', () => {
      const message = {
        jsonrpc: JSONRPC_VERSION,
        id: true, // boolean is not allowed
        method: 'test',
      };
      expect(() => parse(jsonRpcMessageSchema, message)).toThrow();
    });
  });
});
