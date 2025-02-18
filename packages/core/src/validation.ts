import { z } from 'zod';
import type { Role } from './schema.js';

// Base schemas
export const roleSchema = z.enum(['system', 'user', 'assistant']);

export const annotationsSchema = z.object({
  audience: z.array(roleSchema).optional(),
  priority: z.number().min(0).max(1).optional(),
});

// Content schemas
export const textContentSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1),
  annotations: annotationsSchema.optional(),
});

export const imageContentSchema = z.object({
  type: z.literal('image'),
  data: z.string().min(1),
  mimeType: z.string().regex(/^image\//),
  annotations: annotationsSchema.optional(),
});

export const contentSchema = z.discriminatedUnion('type', [
  textContentSchema,
  imageContentSchema,
]);

// Message schemas
export const promptMessageSchema = z.object({
  role: roleSchema,
  content: contentSchema,
});

// Resource schemas
export const uriSchema = z.string().url();

export const resourceSchema = z.object({
  uri: uriSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  mimeType: z.string().min(1),
  size: z.number().nonnegative().optional(),
});

export const resourceTemplateSchema = z.object({
  uriTemplate: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  mimeType: z.string().min(1),
});

// Prompt schemas
export const promptArgumentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().optional(),
});

export const promptSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  arguments: z.array(promptArgumentSchema).optional(),
});

// Sampling schemas
export const modelHintSchema = z.object({
  name: z.string().optional(),
});

export const modelPreferencesSchema = z.object({
  hints: z.array(modelHintSchema).optional(),
  costPriority: z.number().min(0).max(1).optional(),
  speedPriority: z.number().min(0).max(1).optional(),
  intelligencePriority: z.number().min(0).max(1).optional(),
});

export const samplingMessageSchema = z.object({
  role: roleSchema,
  content: contentSchema,
});

export const createMessageParamsSchema = z.object({
  messages: z.array(samplingMessageSchema),
  modelPreferences: modelPreferencesSchema.optional(),
  systemPrompt: z.string().optional(),
  includeContext: z.enum(['none', 'thisServer', 'allServers']).optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().positive(),
  stopSequences: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Tool schemas
export const toolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  inputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.unknown()).optional(),
    required: z.array(z.string()).optional(),
  }),
});

// Completion schemas
export const promptReferenceSchema = z.object({
  type: z.literal('ref/prompt'),
  name: z.string().min(1),
});

export const resourceReferenceSchema = z.object({
  type: z.literal('ref/resource'),
  uri: uriSchema,
});

export const referenceSchema = z.discriminatedUnion('type', [
  promptReferenceSchema,
  resourceReferenceSchema,
]);

export const completionArgumentSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
});

// Logging schemas
export const loggingLevelSchema = z.enum([
  'debug',
  'info',
  'notice',
  'warning',
  'error',
  'critical',
  'alert',
  'emergency',
]);

// Error handling
export class ValidationError extends McpError {
  constructor(
    message: string,
    public readonly errors: z.ZodError
  ) {
    super(-32402, message); // Use custom error code for validation errors
    this.name = 'ValidationError';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      errors: this.errors.errors,
    };
  }
}

// Validation functions
export async function validateResource(resource: unknown): Promise<void> {
  try {
    await resourceSchema.parseAsync(resource);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid resource', error);
    }
    throw error;
  }
}

export async function validatePrompt(prompt: unknown): Promise<void> {
  try {
    await promptSchema.parseAsync(prompt);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid prompt', error);
    }
    throw error;
  }
}

export async function validateSamplingMessage(message: unknown): Promise<void> {
  try {
    await samplingMessageSchema.parseAsync(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid sampling message', error);
    }
    throw error;
  }
}

export async function validateTool(tool: unknown): Promise<void> {
  try {
    await toolSchema.parseAsync(tool);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid tool', error);
    }
    throw error;
  }
}

export async function validateReference(ref: unknown): Promise<void> {
  try {
    await referenceSchema.parseAsync(ref);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid reference', error);
    }
    throw error;
  }
}

export async function validateLoggingLevel(level: unknown): Promise<void> {
  try {
    await loggingLevelSchema.parseAsync(level);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid logging level', error);
    }
    throw error;
  }
}
