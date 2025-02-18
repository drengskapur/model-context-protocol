/**
 * @file sampling.ts
 * @description Message sampling and generation functionality for the Model Context Protocol.
 * Provides types and utilities for working with AI model outputs.
 */

import { z } from 'zod';
import { McpError } from './errors';
import type {
  CreateMessageRequest,
  ModelPreferences,
  SamplingMessage,
} from './schema';

/**
 * Sampling options for message generation.
 */
export interface SamplingOptions {
  /**
   * Maximum number of tokens to generate.
   */
  maxTokens?: number;

  /**
   * Temperature for sampling.
   */
  temperature?: number;

  /**
   * Top-p sampling threshold.
   */
  topP?: number;

  /**
   * Frequency penalty.
   */
  frequencyPenalty?: number;

  /**
   * Presence penalty.
   */
  presencePenalty?: number;

  /**
   * Stop sequences.
   */
  stop?: string[];

  /**
   * Model preferences.
   */
  modelPreferences?: ModelPreferences;
}

/**
 * Response to sampling request.
 */
export interface SamplingResponse {
  /**
   * Generated message.
   */
  message: SamplingMessage;

  /**
   * Additional metadata.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Sampling client interface.
 */
export interface ISamplingClient {
  /**
   * Creates a message using sampling.
   * @param messages Messages to use as context.
   * @param options Options for the sampling process.
   * @returns A promise that resolves to the created message.
   */
  createMessage(
    messages: SamplingMessage[],
    options: SamplingOptions
  ): Promise<SamplingResponse>;

  /**
   * Responds to a sampling request.
   * @param role Role of the message
   * @param content Content of the message
   * @param name Optional name of the message
   * @param metadata Optional metadata
   * @returns Promise that resolves with the response
   */
  respondToSampling(
    role: string,
    content: string,
    name?: string,
    metadata?: Record<string, unknown>
  ): Promise<SamplingResponse>;
}

/**
 * Base class for sampling clients.
 */
export abstract class BaseSamplingClient implements ISamplingClient {
  /**
   * Creates a message using sampling.
   * @param messages Messages to use as context.
   * @param options Options for the sampling process.
   * @returns A promise that resolves to the created message.
   */
  abstract createMessage(
    messages: SamplingMessage[],
    options: SamplingOptions
  ): Promise<SamplingResponse>;

  /**
   * Validates sampling options.
   * @param options Options to validate.
   * @returns Validated options.
   */
  protected validateOptions(options: SamplingOptions): SamplingOptions {
    try {
      return z
        .object({
          maxTokens: z.number().int().positive().optional(),
          temperature: z.number().min(0).max(2).optional(),
          topP: z.number().min(0).max(1).optional(),
          frequencyPenalty: z.number().min(-2).max(2).optional(),
          presencePenalty: z.number().min(-2).max(2).optional(),
          stop: z.array(z.string()).optional(),
          modelPreferences: z
            .object({
              hints: z
                .array(
                  z.object({
                    name: z.string().optional(),
                  })
                )
                .optional(),
              costPriority: z.number().min(0).max(1).optional(),
              speedPriority: z.number().min(0).max(1).optional(),
              intelligencePriority: z.number().min(0).max(1).optional(),
            })
            .optional(),
        })
        .parse(options);
    } catch (error) {
      throw new McpError('validation', 'Invalid sampling options', error as Error);
    }
  }

  /**
   * Validates messages.
   * @param messages Messages to validate.
   */
  protected validateMessages(messages: SamplingMessage[]): void {
    try {
      z.array(
        z.object({
          role: z.enum(['system', 'user', 'assistant', 'function', 'tool']),
          content: z.union([
            z.object({
              type: z.literal('text'),
              text: z.string(),
            }),
            z.object({
              type: z.literal('function_call'),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            }),
            z.object({
              type: z.literal('tool_calls'),
              tool_calls: z.array(
                z.object({
                  id: z.string(),
                  type: z.literal('function'),
                  function: z.object({
                    name: z.string(),
                    arguments: z.string(),
                  }),
                })
              ),
            }),
          ]),
          name: z.string().optional(),
          tool_call_id: z.string().optional(),
        })
      ).parse(messages);
    } catch (error) {
      throw new McpError('validation', 'Invalid messages', error as Error);
    }
  }

  /**
   * Responds to a sampling request.
   * @param role Role of the message
   * @param content Content of the message
   * @param name Optional name of the message
   * @param metadata Optional metadata
   * @returns Promise that resolves with the response
   */
  respondToSampling(
    role: string,
    content: string,
    name?: string,
    metadata?: Record<string, unknown>
  ): Promise<SamplingResponse> {
    const message: SamplingMessage = {
      role,
      content: {
        type: 'text',
        text: content,
      },
      name,
    };

    return Promise.resolve({
      message,
      metadata,
    });
  }
}

/**
 * Sampling class for generating messages.
 */
export class Sampling {
  /**
   * Creates a new message based on the provided messages and options.
   * @param messages Messages to use as input for the sampling process.
   * @param options Options for the sampling process.
   * @returns A promise that resolves to the created message.
   */
  createMessage(
    messages: SamplingMessage[],
    options: SamplingOptions
  ): Promise<SamplingResponse> {
    // Validate messages
    for (const message of messages) {
      try {
        z.object({
          role: z.enum(['system', 'user', 'assistant', 'function', 'tool']),
          content: z.union([
            z.object({
              type: z.literal('text'),
              text: z.string(),
            }),
            z.object({
              type: z.literal('function_call'),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            }),
            z.object({
              type: z.literal('tool_calls'),
              tool_calls: z.array(
                z.object({
                  id: z.string(),
                  type: z.literal('function'),
                  function: z.object({
                    name: z.string(),
                    arguments: z.string(),
                  }),
                })
              ),
            }),
          ]),
          name: z.string().optional(),
          tool_call_id: z.string().optional(),
        }).parse(message);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new McpError(`Invalid message: ${error.message}`, error);
        }
        throw error;
      }
    }

    // Create request
    const _request: CreateMessageRequest = {
      method: 'sampling/createMessage',
      params: {
        messages,
        modelPreferences: options.modelPreferences,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stopSequences: options.stop,
      },
    };

    // Return mock result for now
    return Promise.resolve({
      message: {
        role: 'assistant',
        content: {
          type: 'text',
          text: 'Mock response',
        },
      },
    });
  }

  /**
   * Responds to a sampling message.
   * @param role Role of the response message.
   * @param content Content of the response message.
   * @returns A promise that resolves to the response message.
   */
  respondToSampling(
    role: string,
    content: string,
    name?: string,
    metadata?: Record<string, unknown>
  ): Promise<SamplingResponse> {
    return Promise.resolve({
      message: {
        role,
        content: {
          type: 'text',
          text: content,
        },
        name,
      },
      metadata,
    });
  }
}

export class SamplingClient implements ISamplingClient {
  /**
   * Creates a message using sampling.
   * @param messages Messages to use as context.
   * @param options Options for the sampling process.
   * @returns A promise that resolves to the created message.
   */
  createMessage(
    messages: SamplingMessage[],
    options: SamplingOptions
  ): Promise<SamplingResponse> {
    // Validate messages
    for (const message of messages) {
      try {
        z.object({
          role: z.enum(['system', 'user', 'assistant', 'function', 'tool']),
          content: z.union([
            z.object({
              type: z.literal('text'),
              text: z.string(),
            }),
            z.object({
              type: z.literal('function_call'),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            }),
            z.object({
              type: z.literal('tool_calls'),
              tool_calls: z.array(
                z.object({
                  id: z.string(),
                  type: z.literal('function'),
                  function: z.object({
                    name: z.string(),
                    arguments: z.string(),
                  }),
                })
              ),
            }),
          ]),
          name: z.string().optional(),
          tool_call_id: z.string().optional(),
        }).parse(message);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new McpError(`Invalid message: ${error.message}`, error);
        }
        throw error;
      }
    }

    // Create request
    const _request: CreateMessageRequest = {
      method: 'sampling/createMessage',
      params: {
        messages,
        modelPreferences: options.modelPreferences,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stopSequences: options.stop,
      },
    };

    // Return mock result for now
    return Promise.resolve({
      message: {
        role: 'assistant',
        content: {
          type: 'text',
          text: 'Mock response',
        },
      },
    });
  }

  /**
   * Responds to a sampling request.
   * @param role Role of the message
   * @param content Content of the message
   * @param name Optional name of the message
   * @param metadata Optional metadata
   * @returns Promise that resolves with the response
   */
  respondToSampling(
    role: string,
    content: string,
    name?: string,
    metadata?: Record<string, unknown>
  ): Promise<SamplingResponse> {
    return Promise.resolve({
      message: {
        role,
        content: {
          type: 'text',
          text: content,
        },
        name,
      },
      metadata,
    });
  }
}
