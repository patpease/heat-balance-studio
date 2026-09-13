// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPreference, readPreference, useTheme } from '../src/ui/theme';

/**
 * Three states, two buttons.
 *
 * The state worth guarding is the one with no button: nothing stored means
 * *follow the operating system*, and it is reached by REMOVING the attribute
 * rather than by writing a value. Writing `data-theme="light"` for the default
 * would pin every first-time visitor to light and quietly break dark mode for
 * everyone whose system asks for it — the tokens are already there, and only
 * the media query can see them.
 */
afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
  window.localStorage.clear();
});

const systemPrefersDark = (dark: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: dark && query.includes('dark'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

beforeEach(() => systemPrefersDark(false));

describe('the stored preference', () => {
  it('is absent until a button is pressed', () => {
    expect(readPreference()).toBeNull();
  });

  it('survives a reload once pinned', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setPreference('dark'));
    expect(readPreference()).toBe('dark');
  });

  it('ignores a value that is neither light nor dark', () => {
    window.localStorage.setItem('heat-balance-studio:theme', 'sepia');
    expect(readPreference()).toBeNull();
  });
});

describe('what reaches the document', () => {
  it('stamps the choice so the bare [data-theme] block wins', () => {
    applyPreference('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('REMOVES the attribute for the system state rather than writing a default', () => {
    applyPreference('light');
    applyPreference(null);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('what the buttons read as pressed', () => {
  it('resolves against the system when nothing is stored', () => {
    systemPrefersDark(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBeNull();
    expect(result.current.resolved).toBe('dark');
  });

  it('lets a pinned choice override the system', () => {
    systemPrefersDark(true);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setPreference('light'));

    expect(result.current.resolved).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
