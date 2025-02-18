/**
 * @file auth.ts
 * @description Authentication utilities for the Model Context Protocol.
 * Provides authentication and authorization mechanisms for secure communication.
 */

import { SignJWT, jwtVerify } from 'jose';
import { VError } from 'verror';
import type { JSONRPCRequest, JSONRPCResponse } from './schema.js';

/**
 * Authentication error.
 */
export class AuthenticationError extends Error {
  readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'AuthenticationError';
    this.cause = cause;
  }
}

/**
 * Authentication options for Model Context Protocol.
 */
export interface AuthOptions {
  /**
   * Secret key for signing tokens.
   * Can be a string, Uint8Array, or KeyLike.
   */
  secret: string | Uint8Array;

  /**
   * Token expiration time in seconds.
   * @default 3600
   */
  tokenExpiration?: number;

  /**
   * Token issuer.
   * @default 'model-context-protocol'
   */
  issuer?: string;

  /**
   * Token audience.
   * @default 'model-context-protocol'
   */
  audience?: string;
}

/**
 * Token payload structure.
 */
export interface TokenPayload {
  /**
   * Subject (user ID)
   */
  sub: string;

  /**
   * User roles
   */
  roles: string[];

  /**
   * Issued at timestamp
   */
  iat?: number;

  /**
   * Expiration timestamp
   */
  exp?: number;

  /**
   * Token issuer
   */
  iss?: string;

  /**
   * Token audience
   */
  aud?: string;
}

/**
 * Authentication provider interface.
 */
export interface AuthProvider {
  /**
   * Generates a new authentication token.
   * @param subject Subject identifier
   * @param roles User roles
   * @returns Promise that resolves with the token
   */
  generateToken(subject: string, roles?: string[]): Promise<string>;

  /**
   * Validates an authentication token.
   * @param token Token to validate
   * @returns Promise that resolves with token payload
   */
  validateToken(token: string): Promise<TokenPayload>;
}

/**
 * Authentication class for Model Context Protocol.
 * Handles token generation and validation using JOSE.
 */
export class Auth implements AuthProvider {
  private readonly options: Required<AuthOptions>;
  private secretKey: Uint8Array;

  constructor(options: AuthOptions) {
    this.options = {
      secret: options.secret,
      tokenExpiration: options.tokenExpiration ?? 3600,
      issuer: options.issuer ?? 'model-context-protocol',
      audience: options.audience ?? 'model-context-protocol',
    };

    if (typeof this.options.secret === 'string') {
      const encoder = new TextEncoder();
      this.secretKey = encoder.encode(this.options.secret);
    } else {
      this.secretKey = this.options.secret;
    }
  }

  /**
   * Generates a new authentication token.
   * @param subject Subject identifier
   * @param roles User roles
   * @returns Promise that resolves with the token
   */
  async generateToken(subject: string, roles: string[] = []): Promise<string> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const jwt = await new SignJWT({
        roles,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(subject)
        .setIssuedAt(now)
        .setIssuer(this.options.issuer)
        .setAudience(this.options.audience)
        .setExpirationTime(now + this.options.tokenExpiration)
        .sign(this.secretKey);

      return jwt;
    } catch (error) {
      throw new VError(error as Error, 'Failed to generate token');
    }
  }

  /**
   * Validates an authentication token.
   * @param token Token to validate
   * @returns Promise that resolves with token payload
   */
  async validateToken(token: string): Promise<TokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secretKey, {
        issuer: this.options.issuer,
        audience: this.options.audience,
      });

      if (!payload.sub) {
        throw new Error('Token missing subject');
      }

      return {
        sub: payload.sub,
        roles: (payload.roles as string[]) || [],
        iat: payload.iat,
        exp: payload.exp,
        iss: payload.iss,
        aud: payload.aud as string,
      };
    } catch (error) {
      throw new VError(error as Error, 'Failed to validate token');
    }
  }

  async verify(token: string): Promise<TokenPayload> {
    return await this.validateToken(token);
  }
}

/**
 * Creates a middleware function that checks for authentication.
 * @param auth Authentication provider
 * @param requiredRoles Required roles for the route
 * @param method Route handler function
 * @returns Middleware function
 */
export function withAuth(
  auth: Auth,
  requiredRoles: string[],
  method: (params: Record<string, unknown>) => Promise<unknown>
): (params: Record<string, unknown>) => Promise<unknown> {
  return async (params: Record<string, unknown>) => {
    const token = params?.token as string | undefined;
    if (!token) {
      throw new AuthenticationError('No token provided');
    }

    try {
      const payload = await auth.validateToken(token);
      if (!requiredRoles.every((role) => payload.roles.includes(role))) {
        throw new AuthenticationError('Insufficient permissions');
      }

      return method(params);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('Invalid token', error as Error);
    }
  };
}

export class AuthError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'AuthError';
    if (cause) {
      this.stack = cause.stack;
    }
  }
}

export const createAuthMiddleware = (auth: Auth) => {
  return async (
    request: JSONRPCRequest,
    next: () => Promise<JSONRPCResponse>
  ) => {
    // Verify token
    const token = request.params?.token as string;
    if (!token) {
      throw new AuthError('Missing authentication token');
    }

    try {
      await auth.verify(token);
    } catch (error) {
      throw new AuthError('Invalid authentication token', error as Error);
    }

    return next();
  };
};

/**
 * OAuth metadata response schema.
 */
export interface OAuthMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  response_types_supported: string[];
  code_challenge_methods_supported?: string[];
}

/**
 * Client information response schema.
 */
export interface ClientInformation {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
  client_name: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
}

/**
 * Client metadata for registration.
 */
export interface ClientMetadata {
  redirect_uris: string[];
  client_name: string;
}

/**
 * Token response schema.
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

/**
 * Authorization options.
 */
export interface AuthorizationOptions {
  metadata?: OAuthMetadata;
  clientInformation: ClientInformation;
  redirectUrl: string;
}

/**
 * Token exchange options.
 */
export interface TokenExchangeOptions {
  clientInformation: ClientInformation;
  authorizationCode: string;
  codeVerifier: string;
}

/**
 * Token refresh options.
 */
export interface TokenRefreshOptions {
  clientInformation: ClientInformation;
  refreshToken: string;
}

/**
 * Client registration options.
 */
export interface ClientRegistrationOptions {
  metadata?: OAuthMetadata;
  clientMetadata: ClientMetadata;
}

/**
 * Discovers OAuth metadata from the authorization server.
 * @param baseUrl The base URL of the authorization server
 * @returns The OAuth metadata if discovery succeeds, undefined if not found
 */
export async function discoverOAuthMetadata(
  baseUrl: string
): Promise<OAuthMetadata | undefined> {
  const discoveryUrl = new URL(
    '.well-known/oauth-authorization-server',
    baseUrl
  );
  const response = await fetch(discoveryUrl, {
    headers: {
      'MCP-Protocol-Version': '2024-11-05',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return undefined;
    }
    throw new AuthError(`HTTP ${response.status}`);
  }

  const metadata = await response.json();
  validateOAuthMetadata(metadata);
  return metadata;
}

/**
 * Starts the authorization process.
 * @param baseUrl The base URL of the authorization server
 * @param options Authorization options
 * @returns The authorization URL and code verifier
 */
export async function startAuthorization(
  baseUrl: string,
  options: AuthorizationOptions
): Promise<{ authorizationUrl: URL; codeVerifier: string }> {
  const metadata = options.metadata ?? (await discoverOAuthMetadata(baseUrl));
  if (!metadata) {
    throw new AuthError('Failed to discover OAuth metadata');
  }

  validateResponseTypeSupport(metadata);
  validatePKCESupport(metadata);

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const authUrl = new URL(metadata.authorization_endpoint);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', options.clientInformation.client_id);
  authUrl.searchParams.set('redirect_uri', options.redirectUrl);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return { authorizationUrl: authUrl, codeVerifier };
}

/**
 * Exchanges an authorization code for tokens.
 * @param baseUrl The base URL of the authorization server
 * @param options Token exchange options
 * @returns The token response
 */
export async function exchangeAuthorization(
  baseUrl: string,
  options: TokenExchangeOptions
): Promise<TokenResponse> {
  const metadata = await discoverOAuthMetadata(baseUrl);
  if (!metadata) {
    throw new AuthError('Failed to discover OAuth metadata');
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: options.authorizationCode,
    code_verifier: options.codeVerifier,
    client_id: options.clientInformation.client_id,
    client_secret: options.clientInformation.client_secret,
  });

  const response = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    throw new AuthError('Token exchange failed');
  }

  const tokens = await response.json();
  validateTokenResponse(tokens);
  return tokens;
}

/**
 * Refreshes an access token using a refresh token.
 * @param baseUrl The base URL of the authorization server
 * @param options Token refresh options
 * @returns The token response
 */
export async function refreshAuthorization(
  baseUrl: string,
  options: TokenRefreshOptions
): Promise<TokenResponse> {
  const metadata = await discoverOAuthMetadata(baseUrl);
  if (!metadata) {
    throw new AuthError('Failed to discover OAuth metadata');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: options.refreshToken,
    client_id: options.clientInformation.client_id,
    client_secret: options.clientInformation.client_secret,
  });

  const response = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    throw new AuthError('Token refresh failed');
  }

  const tokens = await response.json();
  validateTokenResponse(tokens);
  return tokens;
}

/**
 * Registers a new client with the authorization server.
 * @param baseUrl The base URL of the authorization server
 * @param options Client registration options
 * @returns The client information
 */
export async function registerClient(
  baseUrl: string,
  options: ClientRegistrationOptions
): Promise<ClientInformation> {
  const metadata = options.metadata ?? (await discoverOAuthMetadata(baseUrl));
  if (!metadata?.registration_endpoint) {
    throw new AuthError(
      'Authorization server does not support dynamic client registration'
    );
  }

  const response = await fetch(metadata.registration_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options.clientMetadata),
  });

  if (!response.ok) {
    throw new AuthError('Dynamic client registration failed');
  }

  const clientInfo = await response.json();
  validateClientInformation(clientInfo);
  return clientInfo;
}

// Validation functions
function validateOAuthMetadata(
  metadata: unknown
): asserts metadata is OAuthMetadata {
  if (!metadata || typeof metadata !== 'object') {
    throw new AuthError('Invalid metadata format');
  }

  const m = metadata as Record<string, unknown>;
  if (
    typeof m.issuer !== 'string' ||
    typeof m.authorization_endpoint !== 'string' ||
    typeof m.token_endpoint !== 'string' ||
    !Array.isArray(m.response_types_supported)
  ) {
    throw new AuthError('Invalid metadata schema');
  }
}

function validateTokenResponse(
  response: unknown
): asserts response is TokenResponse {
  if (!response || typeof response !== 'object') {
    throw new AuthError('Invalid token response format');
  }

  const r = response as Record<string, unknown>;
  if (
    typeof r.access_token !== 'string' ||
    typeof r.token_type !== 'string' ||
    typeof r.expires_in !== 'number'
  ) {
    throw new AuthError('Invalid token response schema');
  }
}

function validateClientInformation(
  info: unknown
): asserts info is ClientInformation {
  if (!info || typeof info !== 'object') {
    throw new AuthError('Invalid client information format');
  }

  const i = info as Record<string, unknown>;
  if (
    typeof i.client_id !== 'string' ||
    typeof i.client_secret !== 'string' ||
    !Array.isArray(i.redirect_uris) ||
    typeof i.client_name !== 'string'
  ) {
    throw new AuthError('Invalid client information schema');
  }
}

function validateResponseTypeSupport(metadata: OAuthMetadata): void {
  if (!metadata.response_types_supported.includes('code')) {
    throw new AuthError(
      'Authorization server does not support response type "code"'
    );
  }
}

function validatePKCESupport(metadata: OAuthMetadata): void {
  if (!metadata.code_challenge_methods_supported?.includes('S256')) {
    throw new AuthError(
      'Authorization server does not support code challenge method "S256"'
    );
  }
}

// PKCE helper functions
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
