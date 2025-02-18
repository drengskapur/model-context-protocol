/**
 * @file validation.ts
 * @description Schema validation utilities for the Model Context Protocol.
 * Provides functions and types for validating protocol messages and data.
 */

import { z } from 'zod';
import { McpError } from './errors.js';

/**
 * Validation error code.
 */
export const VALIDATION_ERROR = -32402;

/**
 * Validation error class.
 */
export class ValidationError extends McpError {
  public readonly errors: z.ZodError;
  public readonly cause?: Error;

  constructor(message: string, errors: z.ZodError, cause?: Error) {
    super(VALIDATION_ERROR, message); // Use custom error code for validation errors
    this.errors = errors;
    this.cause = cause;
  }

  toJSON(): { code: number; message: string; data?: unknown } {
    return {
      code: this.code,
      message: this.message,
      ...(this.cause && { data: this.cause }),
    };
  }
}

/**
 * Validation error details.
 */
export interface ValidationErrorDetails {
  path: (string | number)[];
  message: string;
  type: string;
  value?: unknown;
}

/**
 * Options for configuring validation behavior.
 */
export interface ValidationOptions {
  /**
   * Whether to allow unknown properties.
   * @default false
   */
  allowUnknown?: boolean;

  /**
   * Whether to strip unknown properties.
   * @default true
   */
  stripUnknown?: boolean;

  /**
   * Custom error messages for specific validation failures.
   */
  messages?: Record<string, string>;
}

/**
 * Schema for message roles in the protocol.
 * Possible values: 'system', 'user', 'assistant'
 */
export const roleSchema = z.enum(['system', 'user', 'assistant']);

/**
 * Schema for message annotations.
 * Used to provide additional metadata about messages.
 */
export const annotationsSchema = z.object({
  /** Target audience for the message */
  audience: z.array(roleSchema).optional(),
  /** Priority value between 0 and 1 */
  priority: z.number().min(0).max(1).optional(),
});

/**
 * Schema for text content in messages.
 */
export const textContentSchema = z.object({
  /** Content type, must be 'text' */
  type: z.literal('text'),
  /** Text content */
  text: z.string().min(1),
  /** Optional annotations */
  annotations: annotationsSchema.optional(),
});

/**
 * Schema for image content in messages.
 */
export const imageContentSchema = z.object({
  /** Content type, must be 'image' */
  type: z.literal('image'),
  /** Image data */
  data: z.string().min(1),
  /** Image MIME type */
  mimeType: z.string().regex(/^image\//),
  /** Optional annotations */
  annotations: annotationsSchema.optional(),
});

/**
 * Schema for message content.
 * Can be either text or image content.
 */
export const contentSchema = z.discriminatedUnion('type', [
  textContentSchema,
  imageContentSchema,
]);

/**
 * Schema for sampling messages.
 * Used in model interactions.
 */
export const samplingMessageSchema = z.object({
  /** Message role */
  role: roleSchema,
  /** Message content */
  content: contentSchema,
});

/**
 * Schema for prompts.
 * Defines a reusable prompt template.
 */
export const promptSchema = z.object({
  /** Prompt name */
  name: z.string().min(1),
  /** Optional description */
  description: z.string().optional(),
  /** Optional arguments */
  arguments: z
    .array(
      z.object({
        /** Argument name */
        name: z.string().min(1),
        /** Optional argument description */
        description: z.string().optional(),
        /** Optional argument required flag */
        required: z.boolean().optional(),
      })
    )
    .optional(),
});

/**
 * Schema for resources.
 * Represents a persistent data resource.
 */
export const resourceSchema = z.object({
  /** Resource URI */
  uri: z.string().url(),
  /** Resource name */
  name: z.string().min(1),
  /** Optional resource description */
  description: z.string().optional(),
  /** Resource MIME type */
  mimeType: z.string().min(1),
  /** Optional resource size */
  size: z.number().nonnegative().optional(),
});

/**
 * Schema for resource templates.
 * Represents a template for generating resources.
 */
export const resourceTemplateSchema = z.object({
  /** Resource URI template */
  uriTemplate: z.string().min(1),
  /** Resource name */
  name: z.string().min(1),
  /** Optional resource description */
  description: z.string().optional(),
  /** Resource MIME type */
  mimeType: z.string().min(1),
});

/**
 * Schema for tools.
 * Defines a tool that can be called by the model.
 */
export const toolSchema = z.object({
  /** Tool name */
  name: z.string().min(1),
  /** Optional tool description */
  description: z.string().optional(),
  /** Tool input schema */
  inputSchema: z.object({
    /** Input schema type, must be 'object' */
    type: z.literal('object'),
    /** Input schema properties */
    properties: z.record(z.unknown()).optional(),
    /** Input schema required properties */
    required: z.array(z.string()).optional(),
  }),
});

/**
 * Schema for references.
 * Can reference either a prompt or a resource.
 */
export const referenceSchema = z.discriminatedUnion('type', [
  z.object({
    /** Reference type for prompts */
    type: z.literal('ref/prompt'),
    /** Prompt name */
    name: z.string().min(1),
  }),
  z.object({
    /** Reference type for resources */
    type: z.literal('ref/resource'),
    /** Resource URI template */
    uriTemplate: z.string().min(1),
  }),
]);

/**
 * Schema for logging levels.
 * Standard logging levels from debug to emergency.
 */
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

/**
 * Schema for model hints.
 * Used to provide additional metadata about models.
 */
export const modelHintSchema = z.object({
  /** Model name */
  name: z.string().optional(),
});

/**
 * Schema for model preferences.
 * Used to define model preferences.
 */
export const modelPreferencesSchema = z.object({
  /** Model hints */
  hints: z.array(modelHintSchema).optional(),
  /** Cost priority value between 0 and 1 */
  costPriority: z.number().min(0).max(1).optional(),
  /** Speed priority value between 0 and 1 */
  speedPriority: z.number().min(0).max(1).optional(),
  /** Intelligence priority value between 0 and 1 */
  intelligencePriority: z.number().min(0).max(1).optional(),
});

/**
 * Schema for create message parameters.
 * Used to define parameters for creating messages.
 */
export const createMessageParamsSchema = z.object({
  /** Messages to create */
  messages: z.array(samplingMessageSchema),
  /** Optional model preferences */
  modelPreferences: modelPreferencesSchema.optional(),
  /** Optional system prompt */
  systemPrompt: z.string().optional(),
  /** Optional include context flag */
  includeContext: z.enum(['none', 'thisServer', 'allServers']).optional(),
  /** Optional temperature value between 0 and 1 */
  temperature: z.number().min(0).max(1).optional(),
  /** Maximum number of tokens */
  maxTokens: z.number().positive(),
  /** Optional stop sequences */
  stopSequences: z.array(z.string()).optional(),
  /** Optional metadata */
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Validates a resource.
 * @param resource Resource to validate
 * @throws {ValidationError} If validation fails
 */
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

/**
 * Validates a prompt.
 * @param prompt Prompt to validate
 * @throws {ValidationError} If validation fails
 */
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

/**
 * Validates a sampling message.
 * @param message Message to validate
 * @throws {ValidationError} If validation fails
 */
export async function validateSamplingMessage(message: unknown): Promise<void> {
  try {
    await samplingMessageSchema.parseAsync(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid message', error);
    }
    throw error;
  }
}

/**
 * Validates a tool.
 * @param tool Tool to validate
 * @throws {ValidationError} If validation fails
 */
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

/**
 * Validates a reference.
 * @param ref Reference to validate
 * @throws {ValidationError} If validation fails
 */
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

/**
 * Validates a logging level.
 * @param level Level to validate
 * @throws {ValidationError} If validation fails
 */
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
