/**
 * @file validation.ts
 * @description Schema validation utilities for the Model Context Protocol.
 * Provides functions and types for validating protocol messages and data.
 */

import { z } from 'zod';
import { McpError } from './errors.js';

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
 * Result of a validation operation.
 * Contains validation status and any error details.
 */
export interface ValidationResult<T> {
  /**
   * Whether validation succeeded.
   */
  success: boolean;

  /**
   * Validated and potentially transformed data.
   * Only present if validation succeeded.
   */
  data?: T;

  /**
   * Validation errors if validation failed.
   * Contains detailed information about what went wrong.
   */
  errors?: ValidationError[];
}

/**
 * Detailed information about a validation error.
 */
export interface ValidationError {
  /**
   * Path to the invalid property.
   */
  path: string[];

  /**
   * Error message describing the validation failure.
   */
  message: string;

  /**
   * Type of validation that failed.
   */
  type: string;

  /**
   * Value that failed validation.
   */
  value?: unknown;
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
  arguments: z.array(
    z.object({
      /** Argument name */
      name: z.string().min(1),
      /** Optional argument description */
      description: z.string().optional(),
      /** Optional argument required flag */
      required: z.boolean().optional(),
    })
  ).optional(),
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
    /** Resource URI */
    uri: z.string().url(),
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
 * Validates a resource object.
 * @param resource The resource to validate
 * @throws {ValidationError} If the resource is invalid
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
 * Validates a prompt object.
 * @param prompt The prompt to validate
 * @throws {ValidationError} If the prompt is invalid
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
 * Validates a sampling message object.
 * @param message The message to validate
 * @throws {ValidationError} If the message is invalid
 */
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

/**
 * Validates a tool object.
 * @param tool The tool to validate
 * @throws {ValidationError} If the tool is invalid
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
 * Validates a reference object.
 * @param ref The reference to validate
 * @throws {ValidationError} If the reference is invalid
 */
export async function validateReference(
  ref: { type: 'ref/prompt'; name: string } | { type: 'ref/resource'; uriTemplate: string }
): Promise<void> {
  if (ref.type === 'ref/prompt') {
    if (!ref.name) {
      throw new ValidationError('Prompt reference must have a name', new Error('Missing name'));
    }
  } else if (ref.type === 'ref/resource') {
    if (!ref.uriTemplate) {
      throw new ValidationError('Resource reference must have a uriTemplate', new Error('Missing uriTemplate'));
    }
  } else {
    throw new ValidationError('Invalid reference type', new Error('Unknown reference type'));
  }
}

/**
 * Validates a logging level value.
 * @param level The logging level to validate
 * @throws {ValidationError} If the level is invalid
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

/**
 * Error thrown when validation fails.
 * Contains the Zod validation error details.
 */
export class ValidationError extends McpError {
  readonly errors: z.ZodError;

  /**
   * Creates a new ValidationError instance.
   * @param message Error message
   * @param errors Zod validation error details
   */
  constructor(message: string, errors: z.ZodError) {
    super(-32402, message); // Use custom error code for validation errors
    this.name = 'ValidationError';
    this.errors = errors;
  }

  /**
   * Converts the error to a JSON-RPC error object.
   * @returns JSON-RPC error object with validation details
   */
  toJSON(): { code: number; message: string; data?: unknown } {
    return {
      ...super.toJSON(),
      data: {
        errors: this.errors.errors,
      },
    };
  }
}
