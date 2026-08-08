import { signMessage, verifyMessage } from '../src/signing';

describe('signMessage / verifyMessage (#63)', () => {
  const key = 'test-signing-key';
  const prev = 'previous-signing-key';
  const raw = JSON.stringify({ eventId: 'e-1', eventType: 'x.y.created', payload: { a: 1 }, createdAt: '2026-08-08T00:00:00Z' });

  it('produces a deterministic hex signature for the same input', () => {
    expect(signMessage(raw, key)).toBe(signMessage(raw, key));
    expect(signMessage(raw, key)).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it('produces a different signature for a different key', () => {
    expect(signMessage(raw, key)).not.toBe(signMessage(raw, prev));
  });

  it('verifies a valid signature against the primary key', () => {
    const sig = signMessage(raw, key);
    expect(verifyMessage(raw, sig, key)).toBe('primary');
  });

  it('accepts a valid signature signed by the previous key during rotation', () => {
    const sig = signMessage(raw, prev);
    expect(verifyMessage(raw, sig, key, prev)).toBe('previous');
  });

  it('rejects a tampered payload — signature no longer matches', () => {
    const sig = signMessage(raw, key);
    const tampered = raw.replace('created', 'deleted');
    expect(verifyMessage(tampered, sig, key)).toBeNull();
  });

  it('rejects a signature made with an unknown key', () => {
    const rogueSig = signMessage(raw, 'attacker-key');
    expect(verifyMessage(raw, rogueSig, key, prev)).toBeNull();
  });

  it('rejects a garbage / non-hex signature safely', () => {
    expect(verifyMessage(raw, 'not-hex-at-all', key)).toBeNull();
    expect(verifyMessage(raw, '', key)).toBeNull();
  });
});
