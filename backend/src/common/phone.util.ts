import * as crypto from 'crypto';

/**
 * Normalizes a Malagasy phone number to canonical `03XXXXXXXX` format where possible.
 * Returns null when the input has fewer than 8 digits.
 */
export function normalizeMalagasyPhone(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('261') && digits.length >= 12) {
    digits = `0${digits.slice(3)}`;
  } else if (digits.length === 9 && digits.startsWith('3')) {
    digits = `0${digits}`;
  }

  if (digits.length < 8) return null;
  return digits;
}

/**
 * Generates common DB lookup variants for a phone number so legacy records
 * stored without leading zeros or with spaces still match normalized lookups.
 */
export function getPhoneLookupVariants(raw?: string | null): string[] {
  if (!raw || typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  const normalized = normalizeMalagasyPhone(trimmed);
  const variants = new Set<string>();

  if (trimmed) variants.add(trimmed);
  if (digits) variants.add(digits);
  if (normalized) {
    variants.add(normalized);
    if (normalized.startsWith('0')) {
      const noZero = normalized.slice(1);
      variants.add(noZero);
      variants.add(`+261${noZero}`);
      variants.add(`261${noZero}`);
    }
  }

  return Array.from(variants).filter(Boolean);
}

/**
 * Extracts all unique normalized Malagasy mobile numbers from free text.
 */
export function extractAllMalagasyPhones(text: string): string[] {
  if (!text) return [];
  const cleaned = text.replace(/\+261\s*/g, '0');
  const matches = cleaned.match(/0?3[2-9][\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{2}/g) || [];
  const unique = new Set<string>();

  for (const raw of matches) {
    const normalized = normalizeMalagasyPhone(raw);
    if (normalized && /^03[2-9]\d{7}$/.test(normalized)) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

export interface SignedAuthTokenPayload {
  userId: string;
  phone: string;
  exp: number;
}

/**
 * Derives a deterministic HMAC key from server env config without external deps.
 */
export function resolveAuthSecret(configuredSecret?: string | null, dbUri?: string | null): string {
  const explicit = configuredSecret?.trim();
  if (explicit) return explicit;
  return crypto
    .createHash('sha256')
    .update(`tranogasy-auth-v1:${dbUri || 'local-dev-fallback'}`)
    .digest('hex');
}

export function signAuthToken(
  userId: string,
  phone: string,
  secret: string,
  ttlMs = 30 * 24 * 60 * 60 * 1000,
): string {
  const payload: SignedAuthTokenPayload = {
    userId: String(userId),
    phone: normalizeMalagasyPhone(phone) || phone,
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyAuthToken(
  token: string | undefined | null,
  secret: string,
): SignedAuthTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;

  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!encoded || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedAuthTokenPayload;
    if (!parsed?.userId || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
