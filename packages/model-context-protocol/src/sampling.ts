/**
 * @file sampling.ts
 * @description Message sampling and generation functionality for the Model Context Protocol.
 * Provides types and utilities for working with AI model outputs.
 */

import {
  object,
  string,
  number,
  array,
  union,
  literal,
  optional,
  minValue,
  maxValue,
  parse,
  enumType,
} from 'valibot';
import { McpError } from './errors';
import type {
  CreateMessageRequest,
  ModelPreferences,
  SamplingMessage,
  Role,
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
export interface SamplingClient {
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
    role: Role,
    content: string,
    name?: string,
    metadata?: Record<string, unknown>
  ): Promise<SamplingResponse>;
}

/**
 * Base class for sampling clients.
 */
export abstract class BaseSamplingClient implements SamplingClient {
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
      const schema = object({
        maxTokens: optional(number([minValue(1)])),
        temperature: optional(number([minValue(0), maxValue(2)])),
        topP: optional(number([minValue(0), maxValue(1)])),
        frequencyPenalty: optional(number([minValue(-2), maxValue(2)])),
        presencePenalty: optional(number([minValue(-2), maxValue(2)])),
        stop: optional(array(string())),
        modelPreferences: optional(
          object({
            hints: optional(
              array(
                object({
                  name: optional(string()),
                })
              )
            ),
            costPriority: optional(number([minValue(0), maxValue(1)])),
            speedPriority: optional(number([minValue(0), maxValue(1)])),
            intelligencePriority: optional(number([minValue(0), maxValue(1)])),
          })
        ),
      });
      return parse(schema, options);
    } catch (error) {
      throw new McpError(-32402, 'Invalid sampling options', error);
    }
  }

  /**
   * Validates messages.
   * @param messages Messages to validate.
   */
  protected validateMessages(messages: SamplingMessage[]): void {
    try {
      const schema = array(
        object({
          role: enumType(['user', 'assistant']),
          content: union([
            object({
              type: literal('text'),
              text: string(),
            }),
            object({
              type: literal('function_call'),
              function: object({
                name: string(),
                arguments: string(),
              }),
            }),
            object({
              type: literal('tool_calls'),
              tool_calls: array(
                object({
                  id: string(),
                  type: literal('function'),
                  function: object({
                    name: string(),
                    arguments: string(),
                  }),
                })
              ),
            }),
          ]),
          tool_call_id: optional(string()),
        })
      );
      parse(schema, messages);
    } catch (error) {
      throw new McpError(-32402, 'Invalid messages', error);
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
    role: Role,
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
    const messageSchema = array(
      object({
        role: enumType(['user', 'assistant']),
        content: union([
          object({
            type: literal('text'),
            text: string(),
          }),
          object({
            type: literal('function_call'),
            function: object({
              name: string(),
              arguments: string(),
            }),
          }),
          object({
            type: literal('tool_calls'),
            tool_calls: array(
              object({
                id: string(),
                type: literal('function'),
                function: object({
                  name: string(),
                  arguments: string(),
                }),
              })
            ),
          }),
        ]),
        tool_call_id: optional(string()),
      })
    );

    try {
      parse(messageSchema, messages);
    } catch (error) {
      throw new McpError(-32402, 'Invalid message', error);
    }

    // Create request
    const _request: CreateMessageRequest = {
      method: 'sampling/createMessage',
      params: {
        messages,
        modelPreferences: options.modelPreferences,
        temperature: options.temperature,
        maxTokens: options.maxTokens ?? 0,
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
    role: Role,
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
      },
      metadata,
    });
  }
}

export class SamplingClient implements SamplingClient {
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
    const messageSchema = array(
      object({
        role: enumType(['user', 'assistant']),
        content: union([
          object({
            type: literal('text'),
            text: string(),
          }),
          object({
            type: literal('function_call'),
            function: object({
              name: string(),
              arguments: string(),
            }),
          }),
          object({
            type: literal('tool_calls'),
            tool_calls: array(
              object({
                id: string(),
                type: literal('function'),
                function: object({
                  name: string(),
                  arguments: string(),
                }),
              })
            ),
          }),
        ]),
        tool_call_id: optional(string()),
      })
    );

    try {
      parse(messageSchema, messages);
    } catch (error) {
      throw new McpError(-32402, 'Invalid message', error);
    }

    // Create request
    const _request: CreateMessageRequest = {
      method: 'sampling/createMessage',
      params: {
        messages,
        modelPreferences: options.modelPreferences,
        temperature: options.temperature,
        maxTokens: options.maxTokens ?? 0,
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
    role: Role,
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
      },
      metadata,
    });
  }
}
