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
  minLength,
  custom,
} from 'valibot';
import { McpError } from './errors';
import type {
  CreateMessageRequest,
  ModelPreferences,
  SamplingMessage,
  Role,
  CreateMessageResult,
  TextContent,
  ImageContent,
} from './schema';
import type { McpClient } from './client';
import { VError } from 'verror';

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
 * Error thrown when sampling fails
 */
export class SamplingError extends VError {
  constructor(message: string, cause?: Error) {
    if (cause) {
      super({ cause, name: 'SamplingError' }, message);
    } else {
      super({ name: 'SamplingError' }, message);
    }
  }
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

// Content schema for validation
const contentSchema = union([
  object({
    type: literal('text'),
    text: string([minLength(1)]),
  }),
  object({
    type: literal('image'),
    mimeType: string([custom((value) => value.startsWith('image/'), 'Invalid image MIME type')]),
    data: string([minLength(1)]),
  }),
]);

// Message schema for validation
const messageSchema = object({
  role: enumType(['user', 'assistant', 'system']),
  content: contentSchema,
  name: optional(string([minLength(1)])),
});

export class Sampling {
  constructor(private readonly client: McpClient) {}

  /**
   * Creates a message using sampling.
   * @param messages Messages to use as context.
   * @param options Options for the sampling process.
   * @returns A promise that resolves to the created message.
   */
  async createMessage(
    messages: SamplingMessage[],
    options: CreateMessageRequest['params']
  ): Promise<CreateMessageResult> {
    try {
      // Validate messages
      parse(array(messageSchema), messages);

      const result = await this.client.request<CreateMessageResult>(
        'sampling/createMessage',
        {
          messages,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          stopSequences: options.stopSequences,
          modelPreferences: options.modelPreferences,
          systemPrompt: options.systemPrompt,
          includeContext: options.includeContext,
          metadata: options.metadata,
        }
      );

      return result;
    } catch (error) {
      throw new McpError(-32402, 'Failed to create message', error);
    }
  }

  /**
   * Responds to a sampling request.
   * @param content Content of the message
   * @returns Promise that resolves with the response
   */
  async respondToSampling(
    content: TextContent | ImageContent
  ): Promise<SamplingMessage> {
    try {
      parse(contentSchema, content);
      
      return {
        role: 'assistant',
        content,
      };
    } catch (error) {
      throw new McpError(-32402, 'Invalid content', error);
    }
  }
}
