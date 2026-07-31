import { describe, expect, it } from 'vitest';
import { healthSchema, probeBatchSchema } from './index.js';

describe('healthSchema', () => {
  it('accepts a valid health payload', () => {
    const parsed = healthSchema.parse({
      status: 'ok',
      service: 'wdmbg-api',
      version: '0.0.0',
    });
    expect(parsed.status).toBe('ok');
  });
});

describe('probeBatchSchema', () => {
  it('accepts an empty batch stub', () => {
    const parsed = probeBatchSchema.parse({
      probeId: 'probe-1',
      sentAt: '2026-07-30T12:00:00.000Z',
    });
    expect(parsed.samples).toEqual([]);
  });
});
