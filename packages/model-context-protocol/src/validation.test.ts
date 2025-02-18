/**
 * @file validation.test.ts
 * @description Test suite for the Model Context Protocol validation utilities.
 * Contains unit tests for schema validation and error handling.
 */

import { describe, expect, it } from 'vitest';
import {
  ValidationError,
  validateLoggingLevel,
  validatePrompt,
  validateReference,
  validateResource,
  validateSamplingMessage,
  validateTool,
} from './validation.js';

describe('Validation', () => {
  describe('Resource Validation', () => {
    it('should validate a valid resource', async () => {
      const resource = {
        uri: 'https://example.com/resource',
        name: 'Test Resource',
        mimeType: 'text/plain',
        size: 100,
      };

      await expect(validateResource(resource)).resolves.toBeUndefined();
    });

    it('should reject invalid URIs', async () => {
      const resource = {
        uri: 'not-a-url',
        name: 'Test Resource',
        mimeType: 'text/plain',
      };

      await expect(validateResource(resource)).rejects.toThrow(ValidationError);
    });

    it('should reject negative sizes', async () => {
      const resource = {
        uri: 'https://example.com/resource',
        name: 'Test Resource',
        mimeType: 'text/plain',
        size: -1,
      };

      await expect(validateResource(resource)).rejects.toThrow(ValidationError);
    });
  });

  describe('Prompt Validation', () => {
    it('should validate a valid prompt', async () => {
      const prompt = {
        name: 'test-prompt',
        description: 'A test prompt',
        arguments: [
          {
            name: 'arg1',
            description: 'First argument',
            required: true,
          },
        ],
      };

      await expect(validatePrompt(prompt)).resolves.toBeUndefined();
    });

    it('should reject empty names', async () => {
      const prompt = {
        name: '',
        description: 'A test prompt',
      };

      await expect(validatePrompt(prompt)).rejects.toThrow(ValidationError);
    });

    it('should reject invalid argument structures', async () => {
      const prompt = {
        name: 'test-prompt',
        arguments: [
          {
            description: 'Missing name',
            required: true,
          },
        ],
      };

      await expect(validatePrompt(prompt)).rejects.toThrow(ValidationError);
    });
  });

  describe('Sampling Message Validation', () => {
    it('should validate a valid text message', async () => {
      const message = {
        role: 'assistant',
        content: {
          type: 'text',
          text: 'Hello, world!',
        },
      };

      await expect(validateSamplingMessage(message)).resolves.toBeUndefined();
    });

    it('should reject invalid roles', async () => {
      const message = {
        role: 'invalid-role',
        content: {
          type: 'text',
          text: 'Hello',
        },
      };

      await expect(validateSamplingMessage(message)).rejects.toThrow(
        ValidationError
      );
    });

    it('should reject missing text', async () => {
      const message = {
        role: 'assistant',
        content: {
          type: 'text',
        },
      };

      await expect(validateSamplingMessage(message)).rejects.toThrow(
        ValidationError
      );
    });

    it('should handle image content', async () => {
      const message = {
        role: 'assistant',
        content: {
          type: 'image',
          data: 'base64data',
          mimeType: 'image/png',
        },
      };

      await expect(validateSamplingMessage(message)).resolves.toBeUndefined();
    });

    it('should reject invalid image mime type', async () => {
      const message = {
        role: 'assistant',
        content: {
          type: 'image',
          data: 'base64data',
          mimeType: 'application/json',
        },
      };

      await expect(validateSamplingMessage(message)).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('Tool Validation', () => {
    it('should validate a valid tool', async () => {
      const tool = {
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            arg1: { type: 'string' },
          },
          required: ['arg1'],
        },
      };

      await expect(validateTool(tool)).resolves.toBeUndefined();
    });

    it('should reject invalid input schema types', async () => {
      const tool = {
        name: 'test-tool',
        inputSchema: {
          type: 'array', // Only 'object' is allowed
        },
      };

      await expect(validateTool(tool)).rejects.toThrow(ValidationError);
    });
  });

  describe('Reference Validation', () => {
    it('should validate a valid prompt reference', async () => {
      const ref = {
        type: 'ref/prompt',
        name: 'test-prompt',
      };

      await expect(validateReference(ref)).resolves.toBeUndefined();
    });

    it('should validate a valid resource reference', async () => {
      const ref = {
        type: 'ref/resource',
        uri: 'https://example.com/resource',
      };

      await expect(validateReference(ref)).resolves.toBeUndefined();
    });

    it('should reject invalid reference types', async () => {
      const ref = {
        type: 'invalid-ref',
        name: 'test',
      };

      await expect(validateReference(ref)).rejects.toThrow(ValidationError);
    });
  });

  describe('Logging Level Validation', () => {
    it('should validate valid logging levels', async () => {
      const levels = [
        'debug',
        'info',
        'notice',
        'warning',
        'error',
        'critical',
        'alert',
        'emergency',
      ];

      for (const level of levels) {
        await expect(validateLoggingLevel(level)).resolves.toBeUndefined();
      }
    });

    it('should reject invalid logging levels', async () => {
      await expect(validateLoggingLevel('invalid-level')).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('Validation Error', () => {
    it('should provide detailed error information', async () => {
      try {
        await validateResource({
          uri: 'not-a-url',
        });
        expect(true).toBe(false); // This line should never be reached
      } catch (error) {
        if (!(error instanceof ValidationError)) {
          throw error;
        }
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).toBe('Invalid resource');
        expect(error.errors).toBeDefined();
        expect(Array.isArray(error.errors)).toBe(true);
      }
    });
  });
});
