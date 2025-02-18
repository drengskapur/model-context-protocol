import {
  any,
  array,
  boolean,
  intersect,
  literal,
  number,
  object,
  optional,
  record,
  string,
  union,
  unknown,
} from 'valibot';
import { JSONRPC_VERSION } from './schema.js';

// Basic types
export const progressTokenSchema = union([string(), number()]);
export const cursorSchema = string();
export const requestIdSchema = union([string(), number()]);

// Base schemas
export const metaSchema = object({
  _meta: optional(
    object({
      progressToken: optional(progressTokenSchema),
    })
  ),
});

export const requestSchema = object({
  method: string(),
  params: optional(intersect([record(string(), unknown()), metaSchema])),
});

export const notificationSchema = object({
  method: string(),
  params: optional(intersect([record(string(), unknown()), metaSchema])),
});

export const resultSchema = intersect([
  object({
    _meta: optional(record(string(), unknown())),
  }),
  record(string(), unknown()),
]);

// JSON-RPC Messages
export const jsonRpcRequestSchema = intersect([
  object({
    jsonrpc: literal(JSONRPC_VERSION),
    id: requestIdSchema,
  }),
  requestSchema,
]);

export const jsonRpcNotificationSchema = intersect([
  object({
    jsonrpc: literal(JSONRPC_VERSION),
  }),
  notificationSchema,
]);

export const jsonRpcResponseSchema = object({
  jsonrpc: literal(JSONRPC_VERSION),
  id: requestIdSchema,
  result: resultSchema,
});

export const jsonRpcErrorSchema = object({
  jsonrpc: literal(JSONRPC_VERSION),
  id: requestIdSchema,
  error: object({
    code: number(),
    message: string(),
    data: optional(unknown()),
  }),
});

export const jsonRpcMessageSchema = union([
  jsonRpcRequestSchema,
  jsonRpcNotificationSchema,
  jsonRpcResponseSchema,
  jsonRpcErrorSchema,
]);

// Initialization
export const clientCapabilitiesSchema = object({
  experimental: optional(record(string(), object({}))),
  roots: optional(
    object({
      listChanged: optional(boolean()),
    })
  ),
  sampling: optional(object({})),
});

export const serverCapabilitiesSchema = object({
  experimental: optional(record(string(), object({}))),
  logging: optional(object({})),
  prompts: optional(
    object({
      listChanged: optional(boolean()),
    })
  ),
  resources: optional(
    object({
      subscribe: optional(boolean()),
      listChanged: optional(boolean()),
    })
  ),
  tools: optional(
    object({
      listChanged: optional(boolean()),
    })
  ),
});

export const implementationSchema = object({
  name: string(),
  version: string(),
});

// Resources
export const annotationsSchema = object({
  audience: optional(array(string())),
  priority: optional(number()),
});

export const resourceSchema = object({
  uri: string(),
  name: string(),
  description: optional(string()),
  mimeType: optional(string()),
  size: optional(number()),
  annotations: optional(annotationsSchema),
});

export const resourceTemplateSchema = object({
  uriTemplate: string(),
  name: string(),
  description: optional(string()),
  mimeType: optional(string()),
  annotations: optional(annotationsSchema),
});

export const resourceContentsSchema = object({
  uri: string(),
  mimeType: optional(string()),
});

export const textResourceContentsSchema = intersect([
  resourceContentsSchema,
  object({
    text: string(),
  }),
]);

export const blobResourceContentsSchema = intersect([
  resourceContentsSchema,
  object({
    blob: string(), // base64 encoded
  }),
]);

// Tools
export const toolSchema = object({
  name: string(),
  description: optional(string()),
  inputSchema: object({
    type: literal('object'),
    properties: optional(record(string(), any())),
    required: optional(array(string())),
  }),
});

// Prompts
export const promptArgumentSchema = object({
  name: string(),
  description: optional(string()),
  required: optional(boolean()),
});

export const promptSchema = object({
  name: string(),
  description: optional(string()),
  arguments: optional(array(promptArgumentSchema)),
});

export const promptMessageSchema = object({
  role: union([literal('user'), literal('assistant')]),
  content: union([
    object({ type: literal('text'), text: string() }),
    object({ type: literal('image'), data: string(), mimeType: string() }),
    object({
      type: literal('resource'),
      resource: union([textResourceContentsSchema, blobResourceContentsSchema]),
    }),
  ]),
});
