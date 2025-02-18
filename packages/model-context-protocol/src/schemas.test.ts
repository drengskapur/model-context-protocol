import { parse } from 'valibot';
import { describe, expect, it } from 'vitest';
import { promptMessageSchema, promptSchema } from './schemas.js';

describe('Prompt Schemas', () => {
  describe('Prompt Schema', () => {
    it('validates a complete prompt', () => {
      const prompt = {
        name: 'test-prompt',
        description: 'A test prompt',
        arguments: [
          {
            name: 'arg1',
            description: 'First argument',
            required: true,
          },
          {
            name: 'arg2',
            description: 'Second argument',
          },
        ],
      };
      expect(() => parse(promptSchema, prompt)).not.toThrow();
    });

    it('validates prompt with only required fields', () => {
      const prompt = {
        name: 'test-prompt',
      };
      expect(() => parse(promptSchema, prompt)).not.toThrow();
    });

    it('rejects invalid prompt', () => {
      const prompt = {
        description: 'Missing name field',
        arguments: [],
      };
      expect(() => parse(promptSchema, prompt)).toThrow();
    });
  });

  describe('Prompt Message Schema', () => {
    it('validates text message', () => {
      const message = {
        role: 'user',
        content: {
          type: 'text',
          text: 'Hello, world!',
        },
      };
      expect(() => parse(promptMessageSchema, message)).not.toThrow();
    });

    it('validates image message', () => {
      const message = {
        role: 'assistant',
        content: {
          type: 'image',
          data: 'base64-encoded-data',
          mimeType: 'image/png',
        },
      };
      expect(() => parse(promptMessageSchema, message)).not.toThrow();
    });

    it('validates text resource message', () => {
      const message = {
        role: 'user',
        content: {
          type: 'resource',
          resource: {
            uri: 'file:///test.txt',
            mimeType: 'text/plain',
            text: 'Hello from resource',
          },
        },
      };
      expect(() => parse(promptMessageSchema, message)).not.toThrow();
    });

    it('validates blob resource message', () => {
      const message = {
        role: 'assistant',
        content: {
          type: 'resource',
          resource: {
            uri: 'file:///test.bin',
            mimeType: 'application/octet-stream',
            blob: 'base64-encoded-blob',
          },
        },
      };
      expect(() => parse(promptMessageSchema, message)).not.toThrow();
    });

    it('rejects invalid role', () => {
      const message = {
        role: 'invalid',
        content: {
          type: 'text',
          text: 'Hello',
        },
      };
      expect(() => parse(promptMessageSchema, message)).toThrow();
    });

    it('rejects invalid content type', () => {
      const message = {
        role: 'user',
        content: {
          type: 'invalid',
          data: 'some-data',
        },
      };
      expect(() => parse(promptMessageSchema, message)).toThrow();
    });

    it('rejects missing required fields', () => {
      const message = {
        role: 'user',
        content: {
          type: 'text',
        },
      };
      expect(() => parse(promptMessageSchema, message)).toThrow();
    });
  });
});
