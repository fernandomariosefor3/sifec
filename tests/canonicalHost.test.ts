// Hotfix estabilização — endereço canônico de produção (ver
// src/lib/canonicalHost.ts). Puramente lógico, sem DOM.
import { describe, expect, it } from 'vitest';
import { CANONICAL_SIFEC_URL, isGithubPagesHostname } from '../src/lib/canonicalHost';

describe('CANONICAL_SIFEC_URL', () => {
  it('é o endereço oficial da Vercel', () => {
    expect(CANONICAL_SIFEC_URL).toBe('https://sifec-sand.vercel.app/');
  });
});

describe('isGithubPagesHostname', () => {
  it('reconhece um hostname do GitHub Pages', () => {
    expect(isGithubPagesHostname('fernandomariosefor3.github.io')).toBe(true);
  });

  it('não confunde a Vercel com GitHub Pages', () => {
    expect(isGithubPagesHostname('sifec-sand.vercel.app')).toBe(false);
  });

  it('não confunde localhost com GitHub Pages', () => {
    expect(isGithubPagesHostname('localhost')).toBe(false);
  });

  it('é case-insensitive', () => {
    expect(isGithubPagesHostname('Fernandomariosefor3.GITHUB.IO')).toBe(true);
  });
});
