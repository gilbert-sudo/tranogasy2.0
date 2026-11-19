import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  normalizeMalagasyPhone,
  resolveAuthSecret,
  SignedAuthTokenPayload,
  verifyAuthToken,
} from './phone.util';

export function extractRawAuthToken(
  authTokenHeader?: string,
  authHeader?: string,
): string | undefined {
  const rawBearer = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : undefined;
  return authTokenHeader?.trim() || rawBearer || undefined;
}

export function extractOptionalVerifiedToken(
  configService: ConfigService,
  authTokenHeader?: string,
  authHeader?: string,
): SignedAuthTokenPayload | null {
  const token = extractRawAuthToken(authTokenHeader, authHeader);
  if (!token) return null;
  const secret = resolveAuthSecret(
    configService.get<string>('AUTH_TOKEN_SECRET') ||
      configService.get<string>('JWT_SECRET'),
    configService.get<string>('DATABASE_URI'),
  );
  return verifyAuthToken(token, secret);
}

export function extractRequiredVerifiedToken(
  configService: ConfigService,
  authTokenHeader?: string,
  authHeader?: string,
): SignedAuthTokenPayload {
  const verified = extractOptionalVerifiedToken(
    configService,
    authTokenHeader,
    authHeader,
  );
  if (!verified) {
    throw new UnauthorizedException(
      'Jeton de session invalide ou expiré. Veuillez vous reconnecter.',
    );
  }
  return verified;
}

export function assertVerifiedUserMatchesIdentifier(
  verified: SignedAuthTokenPayload,
  identifier: string,
  allowPhoneMatch = false,
): void {
  const cleanId = String(identifier || '').trim();
  if (!cleanId) {
    throw new ForbiddenException('Accès refusé.');
  }
  if (String(verified.userId) === cleanId) {
    return;
  }
  if (allowPhoneMatch && verified.phone) {
    const tokenPhone = normalizeMalagasyPhone(verified.phone);
    const targetPhone = normalizeMalagasyPhone(cleanId);
    if (tokenPhone && targetPhone && tokenPhone === targetPhone) {
      return;
    }
  }
  throw new ForbiddenException(
    'Vous n’êtes pas autorisé à accéder ou modifier les données d’un autre compte.',
  );
}
