import { describe, expect, it } from 'vitest';
import { moveCardStep, reorderCards, segmentVisibleCards } from './cardOrder';

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

describe('moveCardStep', () => {
  const order = ['trafficSummary', 'topTalkers', 'url:abc', 'topFlows'] as const;

  it('moves a card one step earlier', () => {
    expect(moveCardStep([...order], 'url:abc', 'up')).toEqual([
      'trafficSummary',
      'url:abc',
      'topTalkers',
      'topFlows',
    ]);
  });

  it('moves a card one step later', () => {
    expect(moveCardStep([...order], 'topTalkers', 'down')).toEqual([
      'trafficSummary',
      'url:abc',
      'topTalkers',
      'topFlows',
    ]);
  });

  it('moves url card ids the same as built-in ids', () => {
    expect(moveCardStep([...order], 'url:abc', 'down')).toEqual([
      'trafficSummary',
      'topTalkers',
      'topFlows',
      'url:abc',
    ]);
  });

  it('returns same reference when already first and moving up', () => {
    const input = [...order];
    expect(moveCardStep(input, 'trafficSummary', 'up')).toBe(input);
  });

  it('returns same reference when already last and moving down', () => {
    const input = [...order];
    expect(moveCardStep(input, 'topFlows', 'down')).toBe(input);
  });

  it('returns same reference for unknown ids', () => {
    const input = [...order];
    expect(moveCardStep(input, 'missing', 'up')).toBe(input);
    expect(moveCardStep(input, 'missing', 'down')).toBe(input);
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
