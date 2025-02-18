/**
 * @file validation.ts
 * @description Schema validation utilities for the Model Context Protocol.
 * Provides functions and types for validating protocol messages and data.
 */

import { type ValiError, type BaseSchema, type Input, enumType, number, object, string, array, parse, optional, minValue, maxValue, integer, union, literal } from 'valibot';
import { McpError } from './errors';
import type { JSONRPCRequest, JSONRPCResponse, Resource, Prompt, SamplingMessage, Tool, PromptReference, ResourceReference } from './schema';

/**
 * Validation error code.
 */
export const VALIDATION_ERROR = -32402;

/**
 * Custom validation error class.
 */
export class ValidationError extends McpError {
  constructor(message: string, cause?: ValiError) {
    super(VALIDATION_ERROR, message, {
      errors: cause?.issues,
    });
    this.name = 'ValidationError';
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
  request: JSONRPCRequest,
  schema: T
): Input<T> {
  try {
    return parse(schema, request.params);
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
  response: JSONRPCResponse,
  schema: T
): Input<T> {
  try {
    return parse(schema, response.result);
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
export async function validateLoggingLevel(level: unknown): Promise<string> {
  const schema = enumType(['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency']);
  try {
    return parse(schema, level);
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
    uri: string(),
    name: string(),
    description: optional(string()),
    mimeType: optional(string()),
    size: optional(number([minValue(0)])),
  });
  
  try {
    parse(schema, resource);
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
    name: string(),
    description: optional(string()),
    arguments: optional(array(object({
      name: string(),
      description: optional(string()),
      required: optional(literal(true)),
    }))),
  });
  
  try {
    parse(schema, prompt);
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
    role: enumType(['user', 'assistant', 'system', 'function', 'tool']),
    content: union([
      object({
        type: literal('text'),
        text: string(),
      }),
      object({
        type: literal('image'),
        data: string(),
        mimeType: string(),
      }),
    ]),
    name: optional(string()),
  });
  
  try {
    parse(schema, message);
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
    parse(schema, tool);
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
    parse(schema, ref);
  } catch (error) {
    throw new ValidationError('Invalid reference', error as ValiError);
  }
}
