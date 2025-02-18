/**
 * @file validation.ts
 * @description Schema validation utilities for the Model Context Protocol.
 * Provides functions and types for validating protocol messages and data.
 */

import { z } from 'zod';
import { McpError } from './errors';
import type { JSONRPCRequest, JSONRPCResponse } from './schema';

/**
 * Validation error code.
 */
export const VALIDATION_ERROR = -32402;

/**
 * Custom validation error class.
 */
export class ValidationError extends McpError {
  constructor(message: string, cause?: z.ZodError) {
    super(VALIDATION_ERROR, message, {
      errors: cause?.errors,
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
export function validateRequest<T>(
  request: JSONRPCRequest,
  schema: z.ZodType<T>
): T {
  try {
    return schema.parse(request.params);
  } catch (error) {
    throw new McpError(
      'validation',
      'Invalid request parameters',
      error as Error
    );
  }
}

/**
 * Validates a response against a schema.
 * @param response Response to validate
 * @param schema Schema to validate against
 * @returns Validated response result
 * @throws {ValidationError} If validation fails
 */
export function validateResponse<T>(
  response: JSONRPCResponse,
  schema: z.ZodType<T>
): T {
  try {
    return schema.parse(response.result);
  } catch (error) {
    throw new McpError('validation', 'Invalid response result', error as Error);
  }
}

/**
 * Validates logging level.
 * @param level Logging level to validate
 * @returns Validated logging level
 * @throws {ValidationError} If validation fails
 */
export function validateLoggingLevel(level: unknown): string {
  try {
    return z.enum(['debug', 'info', 'warn', 'error']).parse(level);
  } catch (error) {
    throw new ValidationError('Invalid logging level', error as z.ZodError);
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
    return z
      .object({
        maxTokens: z.number().int().positive().optional(),
        temperature: z.number().min(0).max(2).optional(),
        topP: z.number().min(0).max(1).optional(),
        frequencyPenalty: z.number().min(-2).max(2).optional(),
        presencePenalty: z.number().min(-2).max(2).optional(),
        stop: z.array(z.string()).optional(),
      })
      .parse(options);
  } catch (error) {
    throw new ValidationError('Invalid sampling options', error as z.ZodError);
  }
}
