import { describe, expect, it } from 'vitest';
import { reorderCards } from './cardOrder';

describe('reorderCards', () => {
  const order = ['a', 'b', 'c', 'd'] as const;

  it('inserts source before target when dragging forward', () => {
    expect(reorderCards([...order], 'a', 'c')).toEqual(['b', 'a', 'c', 'd']);
  });

  it('inserts source before target when dragging backward', () => {
    expect(reorderCards([...order], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns same reference when source equals target', () => {
    const input = [...order];
    expect(reorderCards(input, 'b', 'b')).toBe(input);
  });

  it('returns same reference when already immediately before target', () => {
    const input = [...order];
    expect(reorderCards(input, 'b', 'c')).toBe(input);
  });

  it('returns same reference for unknown ids', () => {
    const input = [...order];
    expect(reorderCards(input, 'x', 'a')).toBe(input);
    expect(reorderCards(input, 'a', 'x')).toBe(input);
  });
});
