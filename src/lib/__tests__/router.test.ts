import { describe, it, expect, beforeEach } from 'vitest';
import { parseHash, setHash } from '../router';

describe('parseHash', () => {
  it('defaults to worktrees for empty hash', () => {
    expect(parseHash('')).toEqual({ tab: 'worktrees' });
    expect(parseHash('#')).toEqual({ tab: 'worktrees' });
  });

  it('parses valid tab names', () => {
    expect(parseHash('#worktrees')).toEqual({ tab: 'worktrees' });
    expect(parseHash('#changes')).toEqual({ tab: 'changes' });
    expect(parseHash('#graph')).toEqual({ tab: 'graph' });
    expect(parseHash('#multi-repo')).toEqual({ tab: 'multi-repo' });
  });

  it('defaults to worktrees for invalid tab', () => {
    expect(parseHash('#invalid-tab')).toEqual({ tab: 'worktrees' });
  });

  it('parses graph commit params', () => {
    expect(parseHash('#graph/commit/abc123')).toEqual({
      tab: 'graph',
      params: { commit: 'abc123' },
    });
  });

  it('handles graph without commit param', () => {
    expect(parseHash('#graph')).toEqual({ tab: 'graph' });
  });
});

describe('setHash', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('sets simple tab hash', () => {
    setHash('worktrees');
    expect(window.location.hash).toBe('#worktrees');
  });

  it('sets graph commit hash', () => {
    setHash('graph', { commit: 'abc123' });
    expect(window.location.hash).toBe('#graph/commit/abc123');
  });

  it('does not update hash if already set', () => {
    window.location.hash = '#worktrees';
    const before = window.location.hash;
    setHash('worktrees');
    // Hash should remain the same (no unnecessary update)
    expect(window.location.hash).toBe(before);
  });
});
