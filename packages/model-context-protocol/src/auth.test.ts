/**
 * @file auth.test.ts
 * @description Test suite for the Model Context Protocol authentication.
 * Contains unit tests for authentication and authorization mechanisms.
 */

import { describe, expect, it } from 'vitest';
import { Auth, AuthError, createAuthMiddleware } from './auth.js';
import type { JSONRPCRequest, JSONRPCResponse } from './schema.js';

describe('Auth', () => {
  const auth = new Auth({
    secret: 'test-secret-key-must-be-at-least-32-characters',
    issuer: 'test-issuer',
    audience: 'test-audience',
  });

  it('should generate and validate tokens', async () => {
    const subject = 'user123';
    const roles = ['user', 'admin'];

    const token = await auth.generateToken(subject, roles);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const payload = await auth.validateToken(token);
    expect(payload.sub).toBe(subject);
    expect(payload.roles).toEqual(roles);
    expect(payload.iss).toBe('test-issuer');
    expect(payload.aud).toBe('test-audience');
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
  });

  it('should reject invalid tokens', async () => {
    await expect(auth.validateToken('invalid-token')).rejects.toThrow();
  });

  it('should reject expired tokens', async () => {
    const auth = new Auth({
      secret: 'test-secret-key-must-be-at-least-32-characters',
      tokenExpiration: 0, // Expire immediately
    });

    const token = await auth.generateToken('user123', ['user']);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for token to expire
    await expect(auth.validateToken(token)).rejects.toThrow();
  });

  it('should enforce role-based access control', async () => {
    const token = await auth.generateToken('user123', ['user']);
    const payload = await auth.validateToken(token);
    expect(payload.roles).toContain('user');
    expect(payload.roles).not.toContain('admin');
  });

  describe('AuthMiddleware', () => {
    it('should allow access with valid token', async () => {
      const middleware = createAuthMiddleware(auth);
      const token = await auth.generateToken('user123', ['user']);

      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: '1',
        method: 'test',
        params: { token, data: 'test' },
      };

      const next = async (): Promise<JSONRPCResponse> => ({
        jsonrpc: '2.0' as const,
        id: '1',
        result: { data: 'test' },
      });

      const result = await middleware(request, next);
      expect(result).toEqual({
        jsonrpc: '2.0',
        id: '1',
        result: { data: 'test' },
      });
    });

    it('should deny access with missing token', async () => {
      const middleware = createAuthMiddleware(auth);
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: '1',
        method: 'test',
        params: { data: 'test' },
      };

      const next = async (): Promise<JSONRPCResponse> => ({
        jsonrpc: '2.0' as const,
        id: '1',
        result: { data: 'test' },
      });

      await expect(middleware(request, next)).rejects.toThrow(AuthError);
    });

    it('should deny access with invalid token', async () => {
      const middleware = createAuthMiddleware(auth);
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: '1',
        method: 'test',
        params: { token: 'invalid-token', data: 'test' },
      };

      const next = async (): Promise<JSONRPCResponse> => ({
        jsonrpc: '2.0' as const,
        id: '1',
        result: { data: 'test' },
      });

      await expect(middleware(request, next)).rejects.toThrow(AuthError);
    });
  });
});
