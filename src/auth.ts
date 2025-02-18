import { SignJWT, jwtVerify } from 'jose';

export interface AuthOptions {
  secretKey: Uint8Array | string;
  tokenExpiration?: number;
  issuer?: string;
  audience?: string;
}

export interface AuthPayload {
  sub: string;
  roles: string[];
  exp?: number;
  iat?: number;
  iss?: string;
  aud?: string;
}

export class AuthenticationError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'AuthenticationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class Authentication {
  private readonly secretKey: Uint8Array;
  private readonly options: Required<AuthOptions>;

  constructor(options: AuthOptions) {
    this.secretKey = typeof options.secretKey === 'string' 
      ? new TextEncoder().encode(options.secretKey)
      : options.secretKey;
    
    this.options = {
      tokenExpiration: 3600,
      issuer: 'mcp',
      audience: 'mcp-client',
      ...options
    };
  }

  async generateToken(subject: string, roles: string[]): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    return new SignJWT({ roles })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(subject)
      .setIssuedAt(now)
      .setIssuer(this.options.issuer)
      .setAudience(this.options.audience)
      .setExpirationTime(now + this.options.tokenExpiration)
      .sign(this.secretKey);
  }

  async verifyToken(token: string): Promise<AuthPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secretKey, {
        issuer: this.options.issuer,
        audience: this.options.audience,
      });

      if (!payload.sub || !Array.isArray(payload.roles)) {
        throw new Error('Invalid token payload');
      }

      return payload as AuthPayload;
    } catch (error) {
      throw new AuthenticationError(
        'Token verification failed',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async verifyPermission(token: string, requiredRoles: string[]): Promise<boolean> {
    const payload = await this.verifyToken(token);
    return requiredRoles.some(role => payload.roles.includes(role));
  }
}

export function withAuth(
  auth: Authentication,
  requiredRoles: string[],
  method: (params: any) => Promise<any>
): (params: any) => Promise<any> {
  return async (params: any) => {
    const token = params?.token;
    if (!token) {
      throw new AuthenticationError('Authentication token required');
    }

    const hasPermission = await auth.verifyPermission(token, requiredRoles);
    if (!hasPermission) {
      throw new AuthenticationError('Insufficient permissions');
    }

    const { token: _, ...methodParams } = params;
    return method(methodParams);
  };
} 