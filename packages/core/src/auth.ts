import { z } from 'zod';
import { McpError } from './errors.js';
import { type BaseSchema } from 'valibot';

export class AuthorizationError extends McpError {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export interface AuthToken {
  sub: string;
  iat: number;
  exp: number;
  roles: string[];
}

export const authTokenSchema = z.object({
  sub: z.string(),
  iat: z.number(),
  exp: z.number(),
  roles: z.array(z.string())
});

export interface AuthOptions {
  secret: string;
  tokenExpiration?: number; // in seconds, default 1 hour
}

export class Authorization {
  private secret: string;
  private tokenExpiration: number;

  constructor(options: AuthOptions) {
    this.secret = options.secret;
    this.tokenExpiration = options.tokenExpiration ?? 3600; // 1 hour default
  }

  async generateToken(subject: string, roles: string[]): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const token: AuthToken = {
      sub: subject,
      iat: now,
      exp: now + this.tokenExpiration,
      roles
    };
    
    // Base64 encode token for now - in production this should use proper JWT
    return Buffer.from(JSON.stringify(token)).toString('base64');
  }

  async verifyToken(token: string): Promise<AuthToken> {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      const validated = authTokenSchema.parse(decoded);
      
      const now = Math.floor(Date.now() / 1000);
      if (validated.exp < now) {
        throw new AuthorizationError('Token expired');
      }
      
      return validated;
    } catch (error) {
      throw new AuthorizationError('Invalid token');
    }
  }

  async verifyPermission(token: string, requiredRoles: string[]): Promise<boolean> {
    const decoded = await this.verifyToken(token);
    return requiredRoles.some(role => decoded.roles.includes(role));
  }
}

export interface AuthMiddlewareOptions {
  auth: Authorization;
  requiredRoles?: string[];
}

export function createAuthMiddleware<T extends BaseSchema>(
  options: AuthMiddlewareOptions,
  handler: (params: unknown) => Promise<unknown>
): (params: unknown) => Promise<unknown> {
  return async (params: unknown) => {
    const { auth, requiredRoles = [] } = options;
    
    if (!params || typeof params !== 'object') {
      throw new AuthorizationError('Invalid request parameters');
    }

    const { token, ...rest } = params as { token?: string; [key: string]: unknown };
    
    if (!token) {
      throw new AuthorizationError('No authorization token provided');
    }

    const hasPermission = await auth.verifyPermission(token, requiredRoles);
    if (!hasPermission) {
      throw new AuthorizationError('Insufficient permissions');
    }

    return handler(rest);
  };
}
