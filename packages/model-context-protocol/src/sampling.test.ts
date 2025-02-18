/**
 * @file sampling.test.ts
 * @description Test suite for the Model Context Protocol sampling functionality.
 * Contains unit tests for message generation and validation.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Sampling } from './sampling';
import type { ImageContent, Role, SamplingMessage, TextContent } from './schema';
import { McpClient } from './client';
import { InMemoryTransport } from './in-memory';

describe('Sampling', () => {
  let sampling: Sampling;

  beforeEach(() => {
    const transport = new InMemoryTransport();
    const client = new McpClient({
      name: 'test-client',
      version: '1.0.0'
    }, transport);
    sampling = new Sampling(client);
  });

  describe('createMessage', () => {
    it('should create a valid sampling message', async () => {
      const messages: SamplingMessage[] = [
        {
          role: 'user' as Role,
          content: {
            type: 'text',
            text: 'Hello'
          }
        }
      ];

      const result = await sampling.createMessage(messages, {
        messages,
        maxTokens: 100
      });
      expect(result).toHaveProperty('role', 'assistant');
    });

    it('should handle model preferences', async () => {
      const messages: SamplingMessage[] = [
        {
          role: 'user' as Role,
          content: {
            type: 'text',
            text: 'Hello'
          }
        }
      ];

      const result = await sampling.createMessage(messages, {
        messages,
        maxTokens: 100,
        modelPreferences: {
          hints: [{ name: 'test-model' }]
        },
        temperature: 0.7
      });
      expect(result).toHaveProperty('role', 'assistant');
    });

    it('should validate messages', async () => {
      const invalidMessages: SamplingMessage[] = [
        {
          role: 'invalid_role' as Role,
          content: {
            type: 'text',
            text: 'Hello'
          }
        }
      ];

      await expect(
        sampling.createMessage(invalidMessages, {
          messages: invalidMessages,
          maxTokens: 100
        })
      ).rejects.toThrow();
    });

    it('should handle image content', async () => {
      const messages: SamplingMessage[] = [
        {
          role: 'user' as Role,
          content: {
            type: 'image',
            data: 'base64_encoded_image_data',
            mimeType: 'image/jpeg'
          }
        }
      ];

      const result = await sampling.createMessage(messages, {
        messages,
        maxTokens: 100
      });
      expect(result).toHaveProperty('role', 'assistant');
    });

    it('should throw error for empty messages', async () => {
      await expect(
        sampling.createMessage([], {
          messages: [],
          maxTokens: 100
        })
      ).rejects.toThrow('Messages array is required and must not be empty');
    });
  });

  describe('respondToSampling', () => {
    it('should create a valid text response', async () => {
      const textContent: TextContent = {
        type: 'text',
        text: 'This is a response'
      };

      const response = await sampling.respondToSampling(textContent);
      expect(response).toEqual({
        role: 'assistant',
        content: textContent
      });
    });

    it('should create a valid image response', async () => {
      const imageContent: ImageContent = {
        type: 'image',
        data: 'base64_encoded_image_data',
        mimeType: 'image/jpeg'
      };

      const response = await sampling.respondToSampling(imageContent);
      expect(response).toEqual({
        role: 'assistant',
        content: imageContent
      });
    });

    it('should validate response content', async () => {
      const invalidContent = {
        type: 'invalid_type',
        data: 'some_data'
      };

      await expect(
        sampling.respondToSampling(invalidContent as TextContent | ImageContent)
      ).rejects.toThrow();
    });

    it('should handle annotations', async () => {
      const textContent: TextContent = {
        type: 'text',
        text: 'This is a response',
        annotations: {
          audience: ['user' as Role],
          priority: 0.8
        }
      };

      const response = await sampling.respondToSampling(textContent);
      expect(response).toEqual({
        role: 'assistant',
        content: textContent
      });
    });
  });
});
