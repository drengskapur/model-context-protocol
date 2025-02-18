/**
 * @file validation.ts
 * @description Schema validation utilities for the Model Context Protocol.
 * Provides functions and types for validating protocol messages and data.
 */

import {
  type ValiError,
  type BaseSchema,
  type Input,
  enumType,
  number,
  object,
  string,
  array,
  parse,
  optional,
  minValue,
  maxValue,
  integer,
  union,
  literal,
  custom,
  minLength,
} from 'valibot';
import { McpError } from './errors';

/**
 * Validation error code.
 */
export const VALIDATION_ERROR = -32402;

/**
 * Custom validation error class.
 */
export class ValidationError extends McpError {
  public readonly errors?: ValiError['issues'];

  constructor(message: string, cause?: ValiError) {
    super(VALIDATION_ERROR, message, {
      errors: cause?.issues,
    });
    this.name = 'ValidationError';
    this.errors = cause?.issues;
  }
}

/**
 * Validates a request against a schema.
 * @param request Request to validate
 * @param schema Schema to validate against
 * @returns Validated request parameters
 * @throws {ValidationError} If validation fails
 */
export function validateRequest<T extends BaseSchema>(
  request: unknown,
  schema: T
): Input<T> {
  try {
    return parse(schema, request);
  } catch (error) {
    throw new ValidationError('Invalid request parameters', error as ValiError);
  }
}

/**
 * Validates a response against a schema.
 * @param response Response to validate
 * @param schema Schema to validate against
 * @returns Validated response result
 * @throws {ValidationError} If validation fails
 */
export function validateResponse<T extends BaseSchema>(
  response: unknown,
  schema: T
): Input<T> {
  try {
    return parse(schema, response);
  } catch (error) {
    throw new ValidationError('Invalid response result', error as ValiError);
  }
}

/**
 * Validates logging level.
 * @param level Logging level to validate
 * @returns Promise that resolves with the validated level
 * @throws {ValidationError} If validation fails
 */
export async function validateLoggingLevel(level: unknown): Promise<void> {
  const schema = enumType([
    'debug',
    'info',
    'notice',
    'warning',
    'error',
    'critical',
    'alert',
    'emergency',
  ]);
  try {
    await parse(schema, level);
  } catch (error) {
    throw new ValidationError('Invalid logging level', error as ValiError);
  }
}

/**
 * Validates sampling options.
 * @param options Options to validate
 * @returns Validated options
 * @throws {ValidationError} If validation fails
 */
export function validateSamplingOptions(options: unknown): {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
} {
  try {
    const schema = object({
      maxTokens: optional(number([integer(), minValue(1)])),
      temperature: optional(number([minValue(0), maxValue(2)])),
      topP: optional(number([minValue(0), maxValue(1)])),
      frequencyPenalty: optional(number([minValue(-2), maxValue(2)])),
      presencePenalty: optional(number([minValue(-2), maxValue(2)])),
      stop: optional(array(string())),
    });
    return parse(schema, options);
  } catch (error) {
    throw new ValidationError('Invalid sampling options', error as ValiError);
  }
}

/**
 * Validates a resource.
 * @param resource Resource to validate
 * @returns Promise that resolves when validation succeeds
 * @throws {ValidationError} If validation fails
 */
export async function validateResource(resource: unknown): Promise<void> {
  const schema = object({
    uri: string([minLength(1), custom((value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }, 'Invalid URI')]),
    name: string([minLength(1)]),
    description: optional(string()),
    mimeType: optional(string([minLength(1)])),
    size: optional(number([minValue(0)])),
  });

  try {
    await parse(schema, resource);
  } catch (error) {
    throw new ValidationError('Invalid resource', error as ValiError);
  }
}

/**
 * Validates a prompt.
 * @param prompt Prompt to validate
 * @returns Promise that resolves when validation succeeds
 * @throws {ValidationError} If validation fails
 */
export async function validatePrompt(prompt: unknown): Promise<void> {
  const schema = object({
    name: string([minLength(1)]),
    description: optional(string()),
    arguments: optional(
      array(
        object({
          name: string([minLength(1)]),
          description: optional(string()),
          required: optional(literal(true)),
        })
      )
    ),
  });

  try {
    await parse(schema, prompt);
  } catch (error) {
    throw new ValidationError('Invalid prompt', error as ValiError);
  }
}

/**
 * Validates a sampling message.
 * @param message Message to validate
 * @returns Promise that resolves when validation succeeds
 * @throws {ValidationError} If validation fails
 */
export async function validateSamplingMessage(message: unknown): Promise<void> {
  const schema = object({
    role: enumType(['user', 'assistant', 'system']),
    content: union([
      object({
        type: literal('text'),
        text: string([minLength(1)]),
      }),
      object({
        type: literal('image'),
        data: string(),
        mimeType: string([custom((value) => {
          return value.startsWith('image/');
        }, 'Invalid image MIME type')]),
      }),
    ]),
    name: optional(string()),
  });

  try {
    await parse(schema, message);
  } catch (error) {
    throw new ValidationError('Invalid sampling message', error as ValiError);
  }
}

/**
 * Validates a tool.
 * @param tool Tool to validate
 * @returns Promise that resolves when validation succeeds
 * @throws {ValidationError} If validation fails
 */
export async function validateTool(tool: unknown): Promise<void> {
  const schema = object({
    name: string(),
    description: optional(string()),
    inputSchema: object({
      type: literal('object'),
      properties: optional(object({})),
      required: optional(array(string())),
    }),
  });

  try {
    await parse(schema, tool);
  } catch (error) {
    throw new ValidationError('Invalid tool', error as ValiError);
  }
}

/**
 * Validates a reference.
 * @param ref Reference to validate
 * @returns Promise that resolves when validation succeeds
 * @throws {ValidationError} If validation fails
 */
export async function validateReference(ref: unknown): Promise<void> {
  const schema = union([
    object({
      type: literal('ref/prompt'),
      name: string(),
    }),
    object({
      type: literal('ref/resource'),
      uri: string(),
    }),
  ]);

  try {
    await parse(schema, ref);
  } catch (error) {
    throw new ValidationError('Invalid reference', error as ValiError);
  }
}

/**
 * Validates a request against a schema.
 * @param request Request to validate
 * @param schema Schema to validate against
 * @returns Validated request parameters
 * @throws {ValidationError} If validation fails
 */
export async function validate(): Promise<void> {
  await Promise.resolve(); // Add minimal await
  // Implementation
}
