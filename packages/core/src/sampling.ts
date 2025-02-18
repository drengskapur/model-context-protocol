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
   * Helps prevent unbounded output length.
   */
  maxTokens?: number;

  /**
   * Sequences that will stop generation when encountered.
   * Useful for controlling output format.
   */
  stopSequences?: string[];

  /**
   * Optional metadata to include with the sampling request.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Represents a message in a conversation with the model.
 * Can contain text, images, or other content types.
 */
export interface SamplingMessage {
  /**
   * Role of the message sender (e.g., 'user', 'assistant').
   */
  role: Role;

  /**
   * Content of the message.
   * Can be text, image data, or other supported formats.
   */
  content: TextContent | ImageContent;
}

/**
 * Text content for a sampling message.
 */
export interface TextContent {
  /**
   * Indicates this is text content.
   */
  type: 'text';

  /**
   * The actual text content.
   */
  text: string;

  /**
   * Optional annotations for the text content.
   */
  annotations?: {
    /**
     * Target audience for the text content.
     */
    audience?: string[];

    /**
     * Priority of the text content.
     */
    priority?: number;
  };
}

/**
 * Image content for a sampling message.
 */
export interface ImageContent {
  /**
   * Indicates this is image content.
   */
  type: 'image';

  /**
   * Base64-encoded image data.
   */
  data: string;

  /**
   * MIME type of the image.
   */
  mimeType: string;

  /**
   * Optional annotations for the image content.
   */
  annotations?: {
    /**
     * Target audience for the image content.
     */
    audience?: string[];

    /**
     * Priority of the image content.
     */
    priority?: number;
  };
}

/**
 * Error class for sampling-related errors.
 */
export class SamplingError extends McpError {
  constructor(message: string) {
    super(message);
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
 * Zod schema for sampling messages.
 */
export const samplingMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.union([textContentSchema, imageContentSchema]),
});

/**
 * Zod schema for model preferences.
 */
export const modelPreferencesSchema = z.object({
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
});

/**
 * Options for the sampling process.
 */
export interface SamplingOptions {
  /**
   * Model preferences for the sampling process.
   */
  modelPreferences?: ModelPreferences;

  /**
   * System prompt for the sampling process.
   */
  systemPrompt?: string;

  /**
   * Include context for the sampling process.
   */
  includeContext?: 'none' | 'thisServer' | 'allServers';

  /**
   * Temperature parameter for the sampling process.
   */
  temperature?: number;

  /**
   * Maximum number of tokens to generate.
   */
  maxTokens: number;

  /**
   * Sequences that will stop generation when encountered.
   */
  stopSequences?: string[];

  /**
   * Optional metadata to include with the sampling request.
   */
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
    try {
      // Validate messages
      for (const message of messages) {
        await samplingMessageSchema.parseAsync(message);
      }

      // Validate model preferences if provided
      if (options.modelPreferences) {
        await modelPreferencesSchema.parseAsync(options.modelPreferences);
      }

      // Construct the sampling request
      const _request: CreateMessageRequest = {
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

      // Here you would typically send this to an LLM provider
      // For now, return a mock response
      const mockResponse: CreateMessageResult = {
        role: 'assistant',
        content: {
          type: 'text',
          text: 'This is a mock response. Implement actual LLM integration here.',
        },
        model: 'mock-model',
        stopReason: 'endTurn',
      };

      return mockResponse;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new SamplingError(`Invalid sampling request: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Responds to a sampling message.
   * @param role Role of the response message.
   * @param content Content of the response message.
   * @returns A promise that resolves to the response message.
   */
  async respondToSampling(
    role: Role,
    content: TextContent | ImageContent
  ): Promise<SamplingMessage> {
    try {
      const message: SamplingMessage = {
        role,
        content,
      };

      // Validate the response message
      await samplingMessageSchema.parseAsync(message);

      return message;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new SamplingError(`Invalid sampling response: ${error.message}`);
      }
      throw error;
    }
  }
}
