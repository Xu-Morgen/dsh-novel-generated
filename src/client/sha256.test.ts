import { describe, expect, it } from 'vitest';
import { sha256Hex } from './sha256.js';

describe('I84 canonical browser SHA-256 helper', () => {
  it('hashes UTF-8 text and equivalent bytes to one lowercase hex digest', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const text = '长篇小说';
    const bytes = new TextEncoder().encode(text).buffer;
    const fromText = await sha256Hex(text);
    expect(fromText).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(bytes)).toBe(fromText);
  });
});
