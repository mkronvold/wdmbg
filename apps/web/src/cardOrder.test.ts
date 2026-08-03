import { describe, expect, it } from 'vitest';
import { reorderCards, segmentVisibleCards } from './cardOrder';

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

describe('segmentVisibleCards', () => {
  it('returns a single grid when no cards are wide', () => {
    expect(segmentVisibleCards(['a', 'b', 'c'], new Set())).toEqual([
      { type: 'grid', ids: ['a', 'b', 'c'] },
    ]);
  });

  it('returns only wide segments when every card is wide', () => {
    expect(segmentVisibleCards(['a', 'b'], new Set(['a', 'b']))).toEqual([
      { type: 'wide', id: 'a' },
      { type: 'wide', id: 'b' },
    ]);
  });

  it('splits non-wide runs around wide cards', () => {
    expect(segmentVisibleCards(['a', 'b', 'c', 'd', 'e'], new Set(['c']))).toEqual([
      { type: 'grid', ids: ['a', 'b'] },
      { type: 'wide', id: 'c' },
      { type: 'grid', ids: ['d', 'e'] },
    ]);
  });

  it('handles leading and trailing wide cards', () => {
    expect(segmentVisibleCards(['w1', 'a', 'w2'], new Set(['w1', 'w2']))).toEqual([
      { type: 'wide', id: 'w1' },
      { type: 'grid', ids: ['a'] },
      { type: 'wide', id: 'w2' },
    ]);
  });

  it('returns empty list for empty input', () => {
    expect(segmentVisibleCards([], new Set(['a']))).toEqual([]);
  });
});
