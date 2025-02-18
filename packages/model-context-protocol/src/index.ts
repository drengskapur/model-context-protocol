/**
 * @file index.ts
 * @description Entry point for the Model Context Protocol core package.
 * Exports all public types, interfaces, and implementations.
 */

// Export core protocol schema and types
export type {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCNotification,
  JSONRPCResponse,
  JSONRPCError,
  RequestId,
  Result,
  LoggingLevel,
  ModelPreferences,
  ProgressToken,
  Prompt,
  PromptMessage,
  PromptReference,
  Resource,
  ResourceReference,
  ResourceTemplate,
  SamplingMessage,
  ServerCapabilities,
  Tool,
  TextContent,
  ImageContent,
} from './schema.js';

export {
  JSONRPC_VERSION,
  LATEST_PROTOCOL_VERSION,
} from './schema.js';

// Export validation schemas for JSON-RPC messages
export {
  jsonRpcRequestSchema,
  jsonRpcNotificationSchema,
  jsonRpcResponseSchema,
  jsonRpcErrorSchema,
  jsonRpcMessageSchema,
  resourceSchema,
  resourceTemplateSchema,
  toolSchema,
  promptSchema,
  promptMessageSchema,
} from './schemas.js';

// Export main client and server implementations
export { McpServer } from './server.js';
export { McpClient } from './client.js';

// Export transport layer interfaces and implementations
export { McpTransport, MessageHandler } from './transport.js';
export { InMemoryTransport } from './in-memory.js';

// Export authorization types and utilities
export * from './auth.js';

// Export built-in transport implementations
export * from './transports/stdio.js';
export * from './transports/sse.js';

// Export sampling types and utilities
export * from './sampling.js';
