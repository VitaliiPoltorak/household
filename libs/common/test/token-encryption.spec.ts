import { decryptSecret, encryptSecret } from '../src/crypto/token-encryption';

describe('encryptSecret / decryptSecret', () => {
  it('round-trips under the same key', () => {
    const payload = encryptSecret('super-secret-token', 'key-a');
    expect(decryptSecret(payload, 'key-a')).toBe('super-secret-token');
  });

  it('throws when no key matches and no fallback is given', () => {
    const payload = encryptSecret('super-secret-token', 'key-a');
    expect(() => decryptSecret(payload, 'key-b')).toThrow();
  });

  describe('key rotation fallback', () => {
    it('decrypts a row encrypted under the previous key once the primary key rotates', () => {
      const payload = encryptSecret('super-secret-token', 'old-key');
      expect(decryptSecret(payload, 'new-key', 'old-key')).toBe(
        'super-secret-token',
      );
    });

    it('prefers the primary key when it matches, ignoring the fallback', () => {
      const payload = encryptSecret('super-secret-token', 'new-key');
      expect(decryptSecret(payload, 'new-key', 'old-key')).toBe(
        'super-secret-token',
      );
    });

    it('throws when neither the primary nor the fallback key matches', () => {
      const payload = encryptSecret('super-secret-token', 'old-key');
      expect(() =>
        decryptSecret(payload, 'new-key', 'some-other-key'),
      ).toThrow();
    });

    it('new connects always encrypt under the primary key, not the fallback', () => {
      const payload = encryptSecret('super-secret-token', 'new-key');
      // Decrypting with only the "previous" key as primary must fail —
      // proves encryptSecret never picks up a rotation fallback by mistake.
      expect(() => decryptSecret(payload, 'old-key')).toThrow();
    });
  });
});
