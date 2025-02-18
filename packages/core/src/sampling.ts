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

export class SamplingError extends McpError {
  constructor(message: string) {
    super(message);
    this.name = 'SamplingError';
  }
}

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

export const samplingMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.union([textContentSchema, imageContentSchema]),
});

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

export interface SamplingOptions {
  modelPreferences?: ModelPreferences;
  systemPrompt?: string;
  includeContext?: 'none' | 'thisServer' | 'allServers';
  temperature?: number;
  maxTokens: number;
  stopSequences?: string[];
  metadata?: object;
}

export class Sampling {
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
