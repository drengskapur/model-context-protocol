/**
 * @file sampling.test.ts
 * @description Test suite for the Model Context Protocol sampling functionality.
 * Contains unit tests for message generation and validation.
 * 
 * @copyright 2025 Codeium
 * @license MIT
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Sampling, SamplingError } from './sampling';
import type { ImageContent, SamplingMessage, TextContent } from './schema.js';

describe('Sampling', () => {
  let sampling: Sampling;

  beforeEach(() => {
    sampling = new Sampling();
  });

  describe('createMessage', () => {
    it('should create a valid sampling message', async () => {
      const messages: SamplingMessage[] = [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Hello, how are you?',
          },
        },
      ];

      const options = {
        maxTokens: 100,
        temperature: 0.7,
      };

      const result = await sampling.createMessage(messages, options);
      expect(result).toHaveProperty('role', 'assistant');
      expect(result).toHaveProperty('content.type', 'text');
      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('stopReason');
    });

    it('should handle model preferences', async () => {
      const messages: SamplingMessage[] = [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Hello',
          },
        },
      ];

      const options = {
        maxTokens: 100,
        modelPreferences: {
          costPriority: 0.8,
          speedPriority: 0.5,
          intelligencePriority: 0.9,
          hints: [{ name: 'gpt-4' }],
        },
      };

      const result = await sampling.createMessage(messages, options);
      expect(result).toHaveProperty('role', 'assistant');
    });

    it('should validate messages', async () => {
      const invalidMessages = [
        {
          role: 'invalid_role',
          content: {
            type: 'text',
            text: 'Hello',
          },
        },
      ];

      await expect(
        sampling.createMessage(invalidMessages as SamplingMessage[], {
          maxTokens: 100,
        })
      ).rejects.toThrow(SamplingError);
    });

    it('should handle image content', async () => {
      const messages: SamplingMessage[] = [
        {
          role: 'user',
          content: {
            type: 'image',
            data: 'base64_encoded_image_data',
            mimeType: 'image/jpeg',
          },
        },
      ];

      const result = await sampling.createMessage(messages, {
        maxTokens: 100,
      });
      expect(result).toHaveProperty('role', 'assistant');
    });

    it('should throw error for empty messages', async () => {
      await expect(sampling.createMessage([], { maxTokens: 100 })).rejects.toThrow(
        'Messages array is required and must not be empty'
      );
    });
  });

  describe('respondToSampling', () => {
    it('should create a valid text response', async () => {
      const textContent: TextContent = {
        type: 'text',
        text: 'This is a response',
      };

      const response = await sampling.respondToSampling(
        'assistant',
        textContent
      );
      expect(response).toEqual({
        role: 'assistant',
        content: textContent,
      });
    });

    it('should create a valid image response', async () => {
      const imageContent: ImageContent = {
        type: 'image',
        data: 'base64_encoded_image_data',
        mimeType: 'image/jpeg',
      };

      const response = await sampling.respondToSampling(
        'assistant',
        imageContent
      );
      expect(response).toEqual({
        role: 'assistant',
        content: imageContent,
      });
    });

    it('should validate response content', async () => {
      const invalidContent = {
        type: 'invalid_type',
        data: 'some_data',
      };

      await expect(
        sampling.respondToSampling(
          'assistant',
          invalidContent as TextContent | ImageContent
        )
      ).rejects.toThrow(SamplingError);
    });

    it('should handle annotations', async () => {
      const textContent: TextContent = {
        type: 'text',
        text: 'Response with annotations',
        annotations: {
          audience: ['user', 'assistant'],
          priority: 0.8,
        },
      };

      const response = await sampling.respondToSampling(
        'assistant',
        textContent
      );
      expect(response.content).toEqual(textContent);
      expect(response.content).toHaveProperty('annotations.audience');
      expect(response.content).toHaveProperty('annotations.priority');
    });
  });
});
