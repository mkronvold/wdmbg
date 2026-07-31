import { afterEach, describe, expect, it } from 'vitest';
import { env, envPort } from './index.js';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe('env', () => {
  it('returns the value when set', () => {
    process.env.WDMBG_TEST = 'hello';
    expect(env('WDMBG_TEST')).toBe('hello');
  });

  it('returns fallback when unset', () => {
    delete process.env.WDMBG_TEST;
    expect(env('WDMBG_TEST', 'fallback')).toBe('fallback');
  });

  it('throws when unset without fallback', () => {
    delete process.env.WDMBG_TEST;
    expect(() => env('WDMBG_TEST')).toThrow(/WDMBG_TEST/);
  });
});

describe('envPort', () => {
  it('parses a valid port', () => {
    process.env.WDMBG_PORT = '4090';
    expect(envPort('WDMBG_PORT', 4080)).toBe(4090);
  });

  it('uses fallback when unset', () => {
    delete process.env.WDMBG_PORT;
    expect(envPort('WDMBG_PORT', 4080)).toBe(4080);
  });
});
