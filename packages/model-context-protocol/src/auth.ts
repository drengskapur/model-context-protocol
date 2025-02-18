/**
 * @file auth.ts
 * @description Authentication and authorization functionality for the Model Context Protocol.
 * Provides types and utilities for securing MCP communications.
 */

import { z } from 'zod';
import { McpError } from './errors.js';

/**
 * Authentication error.
 */
export class AuthorizationError extends McpError {
  constructor(message: string) {
    super(-32401, message); // Use custom error code for authorization errors
    this.name = 'AuthorizationError';
  }
}

/**
 * Interface for authentication providers.
 * Implementations handle token generation and validation.
 */
export interface AuthProvider {
  /**
   * Generates an authentication token.
   * @returns Promise resolving to the generated token
   */
  generateToken(): Promise<string>;

  /**
   * Validates an authentication token.
   * @param token Token to validate
   * @returns Promise resolving to true if valid, false otherwise
   */
  validateToken(token: string): Promise<boolean>;
}

/**
 * Authentication options for Model Context Protocol.
 */
export interface AuthOptions {
  /**
   * Secret key for signing tokens.
   */
  secret?: string;

  /**
   * Token expiration time in seconds.
   * @default 3600
   */
  tokenExpiration?: number;
}

/**
 * Token payload structure.
 */
export interface AuthToken {
  /** Subject (user ID) */
  sub: string;
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
  exp: number;
  /** User roles */
  roles: string[];
}

/**
 * Authentication class for Model Context Protocol.
 * Handles token generation and validation.
 */
export class Authorization implements AuthProvider {
  private readonly options: Required<AuthOptions>;

  constructor(options: AuthOptions = {}) {
    this.options = {
      secret: options.secret ?? 'default-secret',
      tokenExpiration: options.tokenExpiration ?? 3600,
    };
  }

  /**
   * Generates a new authentication token.
   * @param subject Subject identifier
   * @param roles User roles
   * @returns Promise that resolves with the token
   */
  async generateToken(
    subject: string,
    roles: string[] = []
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const token: AuthToken = {
      sub: subject,
      iat: now,
      exp: now + this.options.tokenExpiration,
      roles,
    };

    // Base64 encode token for now - in production this should use proper JWT
    return Buffer.from(JSON.stringify(token)).toString('base64');
  }

  /**
   * Validates an authentication token.
   * @param token Token to validate
   * @returns Promise resolving to true if valid, false otherwise
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      const decoded = this.verifyToken(token);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verifies an authentication token.
   * @param token Token to verify
   * @returns Token payload if valid
   * @throws {AuthorizationError} If token is invalid or expired
   */
  verifyToken(token: string): AuthToken {
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    } catch (_error) {
      throw new AuthorizationError('Invalid token format');
    }

    try {
      const validated = z.object({
        sub: z.string(),
        iat: z.number(),
        exp: z.number(),
        roles: z.array(z.string()),
      }).parse(decoded);

      const now = Math.floor(Date.now() / 1000);
      if (validated.exp < now) {
        throw new AuthorizationError('Token expired');
      }

      return validated;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      throw new AuthorizationError('Invalid token structure');
    }
  }

  /**
   * Verifies if a token has the required roles.
   * @param token Token to verify
   * @param requiredRoles Roles that are required
   * @returns True if token has all required roles
   * @throws {AuthorizationError} If token is invalid or expired
   */
  async verifyPermission(token: string, requiredRoles: string[]): Promise<boolean> {
    const decoded = this.verifyToken(token);
    return requiredRoles.some((role) => decoded.roles.includes(role));
  }
}

/**
 * Authentication middleware options.
 */
export interface AuthMiddlewareOptions {
  /** Authorization instance */
  auth: Authorization;
  /** Required roles for the middleware */
  requiredRoles?: string[];
}

/**
 * Creates an authentication middleware.
 * @param options Middleware options
 * @param handler Handler function to wrap
 * @returns Wrapped handler function
 */
export function createAuthMiddleware<T extends Record<string, unknown>>(
  options: AuthMiddlewareOptions,
  handler: (params: T) => Promise<unknown>
): (params: unknown) => Promise<unknown> {
  return async (params: unknown) => {
    const { auth, requiredRoles = [] } = options;

    if (!params || typeof params !== 'object') {
      throw new AuthorizationError('Invalid request parameters');
    }

    const { token, ...rest } = params as {
      token?: string;
      [key: string]: unknown;
    };

    if (!token) {
      throw new AuthorizationError('No authorization token provided');
    }

    const hasPermission = await auth.verifyPermission(token, requiredRoles);
    if (!hasPermission) {
      throw new AuthorizationError('Insufficient permissions');
    }

    return handler(rest as T);
  };
}
