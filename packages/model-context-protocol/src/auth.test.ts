/**
 * @file auth.test.ts
 * @description Test suite for the Model Context Protocol authentication.
 * Contains unit tests for authentication and authorization mechanisms.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth, AuthError, createAuthMiddleware } from './auth.js';
import {
  discoverOAuthMetadata,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  startAuthorization,
} from './auth.js';
import type { JSONRPCRequest, JSONRPCResponse } from './schema.js';

const RESPONSE_TYPE_ERROR_PATTERN = /does not support response type/;
const INVALID_CLIENT_ERROR_PATTERN = /invalid client/;
const CODE_CHALLENGE_ERROR_PATTERN = /does not support code challenge method/;

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

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

describe('OAuth Authorization', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('discoverOAuthMetadata', () => {
    const validMetadata = {
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://auth.example.com/token',
      registration_endpoint: 'https://auth.example.com/register',
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
    };

    it('returns metadata when discovery succeeds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validMetadata,
      });

      const metadata = await discoverOAuthMetadata('https://auth.example.com');
      expect(metadata).toEqual(validMetadata);
      const calls = mockFetch.mock.calls;
      expect(calls.length).toBe(1);
      const [url, options] = calls[0];
      expect(url.toString()).toBe(
        'https://auth.example.com/.well-known/oauth-authorization-server'
      );
      expect(options.headers).toEqual({
        'MCP-Protocol-Version': '2024-11-05',
      });
    });

    it('returns undefined when discovery endpoint returns 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const metadata = await discoverOAuthMetadata('https://auth.example.com');
      expect(metadata).toBeUndefined();
    });

    it('throws on non-404 errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(
        discoverOAuthMetadata('https://auth.example.com')
      ).rejects.toThrow('HTTP 500');
    });

    it('validates metadata schema', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          // Missing required fields
          issuer: 'https://auth.example.com',
        }),
      });

      await expect(
        discoverOAuthMetadata('https://auth.example.com')
      ).rejects.toThrow();
    });
  });

  describe('startAuthorization', () => {
    const validMetadata = {
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/auth',
      token_endpoint: 'https://auth.example.com/tkn',
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
    };

    const validClientInfo = {
      client_id: 'client123',
      client_secret: 'secret123',
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Client',
    };

    it('generates authorization URL with PKCE challenge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validMetadata,
      });

      const { authorizationUrl, codeVerifier } = await startAuthorization(
        'https://auth.example.com',
        {
          clientInformation: validClientInfo,
          redirectUrl: 'http://localhost:3000/callback',
        }
      );

      expect(authorizationUrl.toString()).toMatch(
        /^https:\/\/auth\.example\.com\/auth\?/
      );
      expect(authorizationUrl.searchParams.get('response_type')).toBe('code');
      expect(authorizationUrl.searchParams.get('code_challenge')).toBeDefined();
      expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe(
        'S256'
      );
      expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
        'http://localhost:3000/callback'
      );
      expect(codeVerifier).toBeDefined();
    });

    it('uses metadata authorization_endpoint when provided', async () => {
      const { authorizationUrl } = await startAuthorization(
        'https://auth.example.com',
        {
          metadata: validMetadata,
          clientInformation: validClientInfo,
          redirectUrl: 'http://localhost:3000/callback',
        }
      );

      expect(authorizationUrl.toString()).toMatch(
        /^https:\/\/auth\.example\.com\/auth\?/
      );
    });

    it('validates response type support', async () => {
      const metadata = {
        ...validMetadata,
        response_types_supported: ['token'], // Does not support 'code'
      };

      await expect(
        startAuthorization('https://auth.example.com', {
          metadata,
          clientInformation: validClientInfo,
          redirectUrl: 'http://localhost:3000/callback',
        })
      ).rejects.toThrow(RESPONSE_TYPE_ERROR_PATTERN);
    });

    it('validates PKCE support', async () => {
      const metadata = {
        ...validMetadata,
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['plain'], // Does not support 'S256'
      };

      await expect(
        startAuthorization('https://auth.example.com', {
          metadata,
          clientInformation: validClientInfo,
          redirectUrl: 'http://localhost:3000/callback',
        })
      ).rejects.toThrow(CODE_CHALLENGE_ERROR_PATTERN);
    });
  });

  describe('exchangeAuthorization', () => {
    const validTokens = {
      access_token: 'access123',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'refresh123',
    };

    const validClientInfo = {
      client_id: 'client123',
      client_secret: 'secret123',
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Client',
    };

    it('exchanges code for tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
          response_types_supported: ['code'],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validTokens,
      });

      const tokens = await exchangeAuthorization('https://auth.example.com', {
        clientInformation: validClientInfo,
        authorizationCode: 'code123',
        codeVerifier: 'verifier123',
      });

      expect(tokens).toEqual(validTokens);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );

      const body = mockFetch.mock.calls[1][1].body as URLSearchParams;
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('code123');
      expect(body.get('code_verifier')).toBe('verifier123');
      expect(body.get('client_id')).toBe('client123');
      expect(body.get('client_secret')).toBe('secret123');
    });

    it('validates token response schema', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
          response_types_supported: ['code'],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          // Missing required fields
          access_token: 'access123',
        }),
      });

      await expect(
        exchangeAuthorization('https://auth.example.com', {
          clientInformation: validClientInfo,
          authorizationCode: 'code123',
          codeVerifier: 'verifier123',
        })
      ).rejects.toThrow();
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
          response_types_supported: ['code'],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(
        exchangeAuthorization('https://auth.example.com', {
          clientInformation: validClientInfo,
          authorizationCode: 'code123',
          codeVerifier: 'verifier123',
        })
      ).rejects.toThrow('Token exchange failed');
    });
  });

  describe('refreshAuthorization', () => {
    const validTokens = {
      access_token: 'newaccess123',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'newrefresh123',
    };

    const validClientInfo = {
      client_id: 'client123',
      client_secret: 'secret123',
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Client',
    };

    it('exchanges refresh token for new tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
          response_types_supported: ['code'],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validTokens,
      });

      const tokens = await refreshAuthorization('https://auth.example.com', {
        clientInformation: validClientInfo,
        refreshToken: 'refresh123',
      });

      expect(tokens).toEqual(validTokens);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );

      const body = mockFetch.mock.calls[1][1].body as URLSearchParams;
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('refresh123');
      expect(body.get('client_id')).toBe('client123');
      expect(body.get('client_secret')).toBe('secret123');
    });

    it('validates token response schema', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
          response_types_supported: ['code'],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          // Missing required fields
          access_token: 'newaccess123',
        }),
      });

      await expect(
        refreshAuthorization('https://auth.example.com', {
          clientInformation: validClientInfo,
          refreshToken: 'refresh123',
        })
      ).rejects.toThrow();
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
          response_types_supported: ['code'],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(
        refreshAuthorization('https://auth.example.com', {
          clientInformation: validClientInfo,
          refreshToken: 'refresh123',
        })
      ).rejects.toThrow('Token refresh failed');
    });
  });

  describe('registerClient', () => {
    const validClientMetadata = {
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Client',
    };

    const validClientInfo = {
      client_id: 'client123',
      client_secret: 'secret123',
      client_id_issued_at: 1612137600,
      client_secret_expires_at: 1612224000,
      ...validClientMetadata,
    };

    it('registers client and returns client information', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
          registration_endpoint: 'https://auth.example.com/register',
          response_types_supported: ['code'],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validClientInfo,
      });

      const clientInfo = await registerClient('https://auth.example.com', {
        clientMetadata: validClientMetadata,
      });

      expect(clientInfo).toEqual(validClientInfo);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/register',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(validClientMetadata),
        })
      );
    });

    it('validates client information response schema', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
          registration_endpoint: 'https://auth.example.com/register',
          response_types_supported: ['code'],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          // Missing required fields
          client_secret: 'secret123',
        }),
      });

      await expect(
        registerClient('https://auth.example.com', {
          clientMetadata: validClientMetadata,
        })
      ).rejects.toThrow();
    });

    it('throws when registration endpoint not available in metadata', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
          response_types_supported: ['code'],
        }),
      });

      await expect(
        registerClient('https://auth.example.com', {
          clientMetadata: validClientMetadata,
        })
      ).rejects.toThrow(INVALID_CLIENT_ERROR_PATTERN);
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
          registration_endpoint: 'https://auth.example.com/register',
          response_types_supported: ['code'],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(
        registerClient('https://auth.example.com', {
          clientMetadata: validClientMetadata,
        })
      ).rejects.toThrow('Dynamic client registration failed');
    });
  });
});
