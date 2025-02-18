/**
 * @file sampling.ts
 * @description Message sampling and generation functionality for the Model Context Protocol.
 * Provides types and utilities for working with AI model outputs.
 */

import { z } from 'zod';
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
 * Error class for sampling-related errors.
 */
export class SamplingError extends McpError {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = 'SamplingError';
  }
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

export interface FunctionCall {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: string;
  function: FunctionCall;
}

export interface RespondToSamplingResponse {
  method: 'sampling/respondToSampling';
  params: {
    role: string;
    content: string;
    name?: string;
    functionCall?: FunctionCall;
    toolCalls?: ToolCall[];
    metadata?: Record<string, unknown>;
  };
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
