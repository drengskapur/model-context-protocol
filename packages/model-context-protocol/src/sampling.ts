/**
 * @file sampling.ts
 * @description Message sampling and generation functionality for the Model Context Protocol.
 * Provides types and utilities for working with AI model outputs.
 */

import { z } from 'zod';
import { VError } from 'verror';
import { McpError } from './errors.js';
import type {
  CreateMessageRequest,
  CreateMessageResult,
  ImageContent,
  ModelPreferences,
  Role,
  SamplingMessage,
  TextContent,
} from './schema.js';

/**
 * Sampling error code.
 */
export const SAMPLING_ERROR = -32100;

/**
 * Sampling error class.
 */
export class SamplingError extends McpError {
  constructor(message: string, cause?: Error) {
    super(SAMPLING_ERROR, message, undefined, { cause });
    this.name = 'SamplingError';
  }
}

/**
 * Message role type.
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'function' | 'tool';

/**
 * Message content type.
 */
export type MessageContent =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'function_call';
      function: {
        name: string;
        arguments: string;
      };
    }
  | {
      type: 'tool_calls';
      tool_calls: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };

/**
 * Message type.
 */
export interface Message {
  role: MessageRole;
  content: MessageContent;
  name?: string;
  tool_call_id?: string;
}

/**
 * Function call type.
 */
export interface FunctionCall {
  name: string;
  arguments: string;
}

/**
 * Tool call type.
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: FunctionCall;
}

/**
 * Response to sampling request.
 */
export interface RespondToSamplingResponse {
  messages: Message[];
}

/**
 * Sampling client interface.
 */
export interface SamplingClient {
  /**
   * Responds to a sampling request.
   * @param role Role of the message
   * @param content Content of the message
   * @param name Optional name of the message
   * @param functionCall Optional function call
   * @param toolCalls Optional tool calls
   * @param metadata Optional metadata
   * @returns Promise that resolves with the response
   */
  respondToSampling(
    role: string,
    content: string,
    name?: string,
    functionCall?: unknown,
    toolCalls?: unknown[],
    metadata?: Record<string, unknown>
  ): Promise<CreateMessageResult>;

  /**
   * Creates a message.
   * @param messages Messages to create
   * @param modelPreferences Model preferences
   * @param systemPrompt Optional system prompt
   * @param includeContext Optional context to include
   * @param temperature Optional temperature
   * @param maxTokens Maximum tokens to generate
   * @param stopSequences Optional stop sequences
   * @param metadata Optional metadata
   * @returns Promise that resolves with the created message
   */
  createMessage(
    messages: SamplingMessage[],
    modelPreferences?: ModelPreferences,
    systemPrompt?: string,
    includeContext?: 'none' | 'thisServer' | 'allServers',
    temperature?: number,
    maxTokens?: number,
    stopSequences?: string[],
    metadata?: Record<string, unknown>
  ): Promise<CreateMessageResult>;
}

/**
 * Base class for sampling implementations.
 */
export abstract class BaseSamplingClient implements SamplingClient {
  /**
   * Validates messages.
   * @param messages Messages to validate
   */
  protected validateMessages(messages: SamplingMessage[]): void {
    if (!Array.isArray(messages)) {
      throw new SamplingError('Messages must be an array');
    }

    if (messages.length === 0) {
      throw new SamplingError('Messages array must not be empty');
    }

    const messageSchema = z.object({
      role: z.string(),
      content: z.object({
        type: z.literal('text'),
        text: z.string(),
      }),
    });

    for (const message of messages) {
      try {
        messageSchema.parse(message);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new SamplingError('Invalid message format', error);
        }
        throw error;
      }
    }
  }

  /**
   * Responds to a sampling request.
   * @param role Role of the message
   * @param content Content of the message
   * @param name Optional name of the message
   * @param functionCall Optional function call
   * @param toolCalls Optional tool calls
   * @param metadata Optional metadata
   * @returns Promise that resolves with the response
   */
  respondToSampling(
    role: string,
    content: string,
    name?: string,
    functionCall?: unknown,
    toolCalls?: unknown[],
    metadata?: Record<string, unknown>
  ): Promise<CreateMessageResult> {
    return Promise.resolve({
      method: 'sampling/respondToSampling',
      params: {
        role,
        content: {
          type: 'text',
          text: content,
        },
        name,
        functionCall,
        toolCalls,
        metadata,
      },
    });
  }

  /**
   * Creates a message.
   * @param messages Messages to create
   * @param modelPreferences Model preferences
   * @param systemPrompt Optional system prompt
   * @param includeContext Optional context to include
   * @param temperature Optional temperature
   * @param maxTokens Maximum tokens to generate
   * @param stopSequences Optional stop sequences
   * @param metadata Optional metadata
   * @returns Promise that resolves with the created message
   */
  createMessage(
    messages: SamplingMessage[],
    modelPreferences?: ModelPreferences,
    systemPrompt?: string,
    includeContext?: 'none' | 'thisServer' | 'allServers',
    temperature?: number,
    maxTokens?: number,
    stopSequences?: string[],
    metadata?: Record<string, unknown>
  ): Promise<CreateMessageResult> {
    this.validateMessages(messages);

    const _request: CreateMessageRequest = {
      method: 'sampling/createMessage',
      params: {
        messages,
        modelPreferences,
        systemPrompt,
        includeContext,
        temperature,
        maxTokens: maxTokens ?? 1000,
        stopSequences,
        metadata,
      },
    };

    return Promise.resolve({
      method: 'sampling/createMessage',
      params: {
        messages,
        modelPreferences,
        systemPrompt,
        includeContext,
        temperature,
        maxTokens: maxTokens ?? 1000,
        stopSequences,
        metadata,
      },
    });
  }
}

/**
 * Configuration for model sampling behavior.
 * Controls how the model generates responses.
 */
export interface SamplingConfig {
  /**
   * Temperature parameter for controlling randomness.
   * Higher values make output more random, lower more deterministic.
   * @default 1.0
   */
  temperature?: number;

  /**
   * Maximum number of tokens to generate.
   * @default 100
   */
  maxTokens?: number;

  /**
   * Stop sequences that will halt generation.
   */
  stopSequences?: string[];

  /**
   * Model-specific metadata.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Zod schema for text content.
 */
export const textContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  annotations: z
    .object({
      audience: z.array(z.string()).optional(),
      priority: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

/**
 * Zod schema for image content.
 */
export const imageContentSchema = z.object({
  type: z.literal('image'),
  data: z.string(),
  mimeType: z.string(),
  annotations: z
    .object({
      audience: z.array(z.string()).optional(),
      priority: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

/**
 * Zod schema for message content.
 */
export const messageContentSchema = z.union([
  textContentSchema,
  imageContentSchema,
]);

/**
 * Zod schema for sampling messages.
 */
export const samplingMessageSchema = z.object({
  role: z.string(),
  content: messageContentSchema,
});

/**
 * Options for the sampling process.
 */
export interface SamplingOptions {
  modelPreferences?: ModelPreferences;
  systemPrompt?: string;
  includeContext?: 'none' | 'thisServer' | 'allServers';
  temperature?: number;
  maxTokens: number;
  stopSequences?: string[];
  metadata?: Record<string, unknown>;
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
  async createMessage(
    messages: SamplingMessage[],
    options: SamplingOptions
  ): Promise<CreateMessageResult> {
    // Validate messages
    for (const message of messages) {
      try {
        samplingMessageSchema.parse(message);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new SamplingError(`Invalid message: ${error.message}`, error);
        }
        throw error;
      }
    }

    // Create request
    const request: CreateMessageRequest = {
      method: 'sampling/createMessage',
      params: {
        messages,
        modelPreferences: options.modelPreferences,
        systemPrompt: options.systemPrompt,
        includeContext: options.includeContext,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stopSequences: options.stopSequences,
        metadata: options.metadata,
      },
    };

    // Return mock result for now
    return Promise.resolve({
      role: 'assistant',
      content: {
        type: 'text',
        text: 'Mock response',
      },
      model: 'mock-model',
      stopReason: 'endTurn',
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
    functionCall?: FunctionCall,
    toolCalls?: ToolCall[],
    metadata?: Record<string, unknown>
  ): Promise<RespondToSamplingResponse> {
    return Promise.resolve({
      method: 'sampling/respondToSampling',
      params: {
        role,
        content,
        name,
        functionCall,
        toolCalls,
        metadata,
      },
    });
  }
}

export class SamplingClient {
  respondToSampling(
    role: string,
    content: string,
    name?: string,
    functionCall?: FunctionCall,
    toolCalls?: ToolCall[],
    metadata?: Record<string, unknown>
  ): Promise<RespondToSamplingResponse> {
    return Promise.resolve({
      method: 'sampling/respondToSampling',
      params: {
        role,
        content,
        name,
        functionCall,
        toolCalls,
        metadata,
      },
    });
  }
}
