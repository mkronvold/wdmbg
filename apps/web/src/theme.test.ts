import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyTheme,
  persistTheme,
  readStoredTheme,
  resolveInitialTheme,
  systemTheme,
} from './theme';

describe('theme helpers', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads system preference when nothing is stored', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: light)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    expect(systemTheme()).toBe('light');
    expect(resolveInitialTheme()).toBe('light');
  });

  it('prefers stored theme over system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: light)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    expect(readStoredTheme()).toBe('dark');
    expect(resolveInitialTheme()).toBe('dark');
  });

  it('applies and persists theme', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    persistTheme('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});
