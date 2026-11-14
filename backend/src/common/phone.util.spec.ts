import {
  extractAllMalagasyPhones,
  getPhoneLookupVariants,
  normalizeMalagasyPhone,
  resolveAuthSecret,
  signAuthToken,
  verifyAuthToken,
} from './phone.util';

describe('phone.util', () => {
  it('normalizes Malagasy phone numbers across local, +261, and 9-digit formats', () => {
    expect(normalizeMalagasyPhone('034 12 345 67')).toBe('0341234567');
    expect(normalizeMalagasyPhone('+261 32 99 888 77')).toBe('0329988877');
    expect(normalizeMalagasyPhone('261381122233')).toBe('0381122233');
    expect(normalizeMalagasyPhone('341234567')).toBe('0341234567');
    expect(normalizeMalagasyPhone('1234')).toBeNull();
    expect(normalizeMalagasyPhone(null)).toBeNull();
  });

  it('builds consistent lookup variants for normalized and un-prefixed stored phones', () => {
    const variants = getPhoneLookupVariants('+261 34 12 345 67');
    expect(variants).toEqual(
      expect.arrayContaining(['0341234567', '341234567', '+261341234567', '261341234567']),
    );
  });

  it('extracts unique Malagasy numbers from post text', () => {
    const extracted = extractAllMalagasyPhones(
      'Appeler 034 12 345 67 ou +261 33 11 222 33. Rappel: 034-12-345-67.',
    );
    expect(extracted).toEqual(['0341234567', '0331122233']);
  });

  it('signs and verifies HMAC auth tokens and rejects tampered or expired tokens', () => {
    const secret = resolveAuthSecret('test-secret-key', null);
    const token = signAuthToken('user_123', '+261 34 12 345 67', secret, 60_000);

    const verified = verifyAuthToken(token, secret);
    expect(verified).not.toBeNull();
    expect(verified!.userId).toBe('user_123');
    expect(verified!.phone).toBe('0341234567');

    // Wrong secret or tampered signature fails
    expect(verifyAuthToken(token, 'wrong-secret')).toBeNull();
    expect(verifyAuthToken(`${token}tamper`, secret)).toBeNull();

    // Expired token fails
    const expiredToken = signAuthToken('user_123', '0341234567', secret, -5_000);
    expect(verifyAuthToken(expiredToken, secret)).toBeNull();
  });
});
