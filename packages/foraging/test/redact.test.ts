import { describe, expect, it } from 'vitest';
import { redact } from '../src/redact.js';

describe('redact', () => {
  it('is a no-op on content with no secret signals', () => {
    const input = 'Plain README body.\n\nNo secrets here.';
    expect(redact(input)).toBe(input);
  });

  it('masks common cloud token assignments while keeping the key', () => {
    const input = [
      'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
      'GITHUB_TOKEN=ghp_secretvaluehere',
      'OPENAI_API_KEY: "sk-proj-abcdef"',
      'NORMAL_VAR=value',
    ].join('\n');

    const out = redact(input);
    expect(out).toContain('AWS_ACCESS_KEY_ID=***REDACTED***');
    expect(out).toContain('GITHUB_TOKEN=***REDACTED***');
    expect(out).toContain('OPENAI_API_KEY: ***REDACTED***');
    // Non-matching keys pass through unchanged.
    expect(out).toContain('NORMAL_VAR=value');
    // Original secret values must not survive.
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(out).not.toContain('ghp_secretvaluehere');
    expect(out).not.toContain('sk-proj-abcdef');
  });

  it('redacts armored PEM private-key blocks', () => {
    const input = [
      'Header line',
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEAv9',
      '-----END RSA PRIVATE KEY-----',
      'Trailing line',
    ].join('\n');

    const out = redact(input);
    expect(out).toContain('***REDACTED_PRIVATE_KEY***');
    expect(out).not.toContain('MIIEowIBAAKCAQEAv9');
    expect(out).toContain('Header line');
    expect(out).toContain('Trailing line');
  });

  it('matches caller-supplied extra env names', () => {
    const input = 'APP_SIGNING_SEED=super-secret-value';
    const out = redact(input, ['APP_SIGNING_SEED']);
    expect(out).toBe('APP_SIGNING_SEED=***REDACTED***');
  });

  it('catches generic *_SECRET / *_PASSWORD / *_PRIVATE_KEY names', () => {
    const input = [
      'MY_DB_PASSWORD=pw',
      'STRIPE_WEBHOOK_SECRET=whsec_live',
      'APP_PRIVATE_KEY=pk',
    ].join('\n');
    const out = redact(input);
    expect(out).not.toContain('pw');
    expect(out).not.toContain('whsec_live');
    expect(out.split('\n').every((l) => l.includes('***REDACTED***'))).toBe(true);
  });
});
