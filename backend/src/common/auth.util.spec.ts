import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  assertVerifiedUserMatchesIdentifier,
  extractOptionalVerifiedToken,
  extractRequiredVerifiedToken,
} from './auth.util';
import { resolveAuthSecret, signAuthToken } from './phone.util';

describe('auth.util', () => {
  const configService = {
    get: (key: string) => {
      if (key === 'AUTH_TOKEN_SECRET') return 'test-auth-secret-key';
      return undefined;
    },
  } as unknown as ConfigService;

  const secret = resolveAuthSecret('test-auth-secret-key', undefined);

  it('extracts and verifies a valid x-auth-token or Bearer token', () => {
    const token = signAuthToken('507f1f77bcf86cd799439011', '0341234567', secret);

    const fromHeader = extractRequiredVerifiedToken(configService, token, undefined);
    expect(fromHeader.userId).toBe('507f1f77bcf86cd799439011');
    expect(fromHeader.phone).toBe('0341234567');

    const fromBearer = extractOptionalVerifiedToken(
      configService,
      undefined,
      `Bearer ${token}`,
    );
    expect(fromBearer?.userId).toBe('507f1f77bcf86cd799439011');
  });

  it('rejects missing, forged, or expired tokens', () => {
    expect(() =>
      extractRequiredVerifiedToken(configService, undefined, undefined),
    ).toThrow(UnauthorizedException);

    expect(() =>
      extractRequiredVerifiedToken(configService, 'forged.signature', undefined),
    ).toThrow(UnauthorizedException);

    const expired = signAuthToken('507f1f77bcf86cd799439011', '0341234567', secret, -1000);
    expect(extractOptionalVerifiedToken(configService, expired, undefined)).toBeNull();
  });

  it('enforces identifier matching by userId and optional normalized phone', () => {
    const verified = {
      userId: '507f1f77bcf86cd799439011',
      phone: '0341234567',
      exp: Date.now() + 60_000,
    };

    expect(() =>
      assertVerifiedUserMatchesIdentifier(verified, '507f1f77bcf86cd799439011'),
    ).not.toThrow();

    expect(() =>
      assertVerifiedUserMatchesIdentifier(verified, '507f1f77bcf86cd799439099'),
    ).toThrow(ForbiddenException);

    expect(() =>
      assertVerifiedUserMatchesIdentifier(verified, '+261 34 12 345 67', true),
    ).not.toThrow();

    expect(() =>
      assertVerifiedUserMatchesIdentifier(verified, '0349999999', true),
    ).toThrow(ForbiddenException);
  });
});
