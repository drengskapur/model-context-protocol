import { beforeEach, describe, expect, it } from 'vitest';
import { type AuthOptions, Authorization, AuthorizationError } from './auth';

describe('Authorization', () => {
  let auth: Authorization;
  const options: AuthOptions = {
    secret: 'test-secret',
    tokenExpiration: 3600,
  };

  beforeEach(() => {
    auth = new Authorization(options);
  });

  describe('generateToken', () => {
    it('should generate a valid token', async () => {
      const subject = 'test-user';
      const roles = ['user', 'admin'];
      const token = await auth.generateToken(subject, roles);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should include subject and roles in token', async () => {
      const subject = 'test-user';
      const roles = ['user', 'admin'];
      const token = await auth.generateToken(subject, roles);

      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      expect(decoded.sub).toBe(subject);
      expect(decoded.roles).toEqual(roles);
    });

    it('should set expiration based on tokenExpiration', async () => {
      const subject = 'test-user';
      const roles = ['user'];
      const now = Math.floor(Date.now() / 1000);
      const token = await auth.generateToken(subject, roles);

      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      expect(decoded.exp).toBeGreaterThan(now);
      expect(decoded.exp).toBeLessThanOrEqual(
        now + (options.tokenExpiration ?? 3600)
      );
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', async () => {
      const subject = 'test-user';
      const roles = ['user'];
      const token = await auth.generateToken(subject, roles);

      const verified = await auth.verifyToken(token);
      expect(verified.sub).toBe(subject);
      expect(verified.roles).toEqual(roles);
    });

    it('should reject an invalid token', async () => {
      const invalidToken = 'invalid-token';
      await expect(auth.verifyToken(invalidToken)).rejects.toThrow(
        AuthorizationError
      );
    });

    it('should reject an expired token', async () => {
      const subject = 'test-user';
      const roles = ['user'];
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = {
        sub: subject,
        iat: now - 7200,
        exp: now - 3600,
        roles,
      };
      const token = Buffer.from(JSON.stringify(expiredToken)).toString('base64');

      await expect(auth.verifyToken(token)).rejects.toThrow('Token expired');
    });
  });

  describe('verifyPermission', () => {
    it('should allow access with required role', async () => {
      const subject = 'test-user';
      const roles = ['user', 'admin'];
      const token = await auth.generateToken(subject, roles);

      const hasPermission = await auth.verifyPermission(token, ['admin']);
      expect(hasPermission).toBe(true);
    });

    it('should deny access without required role', async () => {
      const subject = 'test-user';
      const roles = ['user'];
      const token = await auth.generateToken(subject, roles);

      const hasPermission = await auth.verifyPermission(token, ['admin']);
      expect(hasPermission).toBe(false);
    });

    it('should allow access with any matching role', async () => {
      const subject = 'test-user';
      const roles = ['user'];
      const token = await auth.generateToken(subject, roles);

      const hasPermission = await auth.verifyPermission(token, [
        'admin',
        'user',
      ]);
      expect(hasPermission).toBe(true);
    });
  });
});
