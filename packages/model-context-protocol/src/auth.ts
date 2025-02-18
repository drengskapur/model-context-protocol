/**
 * @file auth.ts
 * @description Authentication functionality for the Model Context Protocol.
 * Provides JWT-based authentication and authorization mechanisms.
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
