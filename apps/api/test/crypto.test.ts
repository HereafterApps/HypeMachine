import { describe, expect, it } from 'vitest';
import { TokenCrypto } from '../src/lib/crypto.js';

describe('TokenCrypto', () => {
  it('round-trips tokens and produces distinct ciphertexts', () => {
    const crypto = new TokenCrypto('test-secret-key-for-tokens');
    const a = crypto.encrypt('ya29.super-secret');
    const b = crypto.encrypt('ya29.super-secret');
    expect(a).not.toBe(b); // random IV
    expect(crypto.decrypt(a)).toBe('ya29.super-secret');
    expect(crypto.decrypt(b)).toBe('ya29.super-secret');
  });

  it('rejects tampered payloads', () => {
    const crypto = new TokenCrypto('test-secret-key-for-tokens');
    const payload = crypto.encrypt('secret');
    const tampered = payload.slice(0, -4) + 'AAAA';
    expect(() => crypto.decrypt(tampered)).toThrow();
  });
});
