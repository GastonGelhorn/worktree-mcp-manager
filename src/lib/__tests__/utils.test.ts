import { describe, it, expect } from 'vitest';
import { basename, truncatePath, groupBranchesByPrefix, parseGitStatus, generateId, cn } from '../utils';

describe('basename', () => {
  it('extracts last segment from path', () => {
    expect(basename('/Users/dev/myproject')).toBe('myproject');
  });

  it('returns input for single segment', () => {
    expect(basename('myproject')).toBe('myproject');
  });

  it('returns input for empty string', () => {
    expect(basename('')).toBe('');
  });
});

describe('truncatePath', () => {
  it('returns short paths as-is', () => {
    expect(truncatePath('/usr/local', 50)).toBe('/usr/local');
  });

  it('truncates long paths with ellipsis', () => {
    const longPath = '/Users/developer/projects/very-long-project-name/src/components';
    const result = truncatePath(longPath, 30);
    expect(result).toContain('/...');
    expect(result.length).toBeLessThan(longPath.length);
  });

  it('preserves paths with few segments even if long', () => {
    const path = '/ab/cde';
    expect(truncatePath(path, 3)).toBe(path);
  });
});

describe('groupBranchesByPrefix', () => {
  it('groups branches by slash prefix', () => {
    const branches = [
      { name: 'feature/auth' },
      { name: 'feature/dashboard' },
      { name: 'bugfix/login' },
      { name: 'main' },
    ];
    const groups = groupBranchesByPrefix(branches);
    expect(groups['feature']).toHaveLength(2);
    expect(groups['bugfix']).toHaveLength(1);
    expect(groups['_other']).toHaveLength(1);
  });

  it('handles empty array', () => {
    expect(groupBranchesByPrefix([])).toEqual({});
  });
});

describe('parseGitStatus', () => {
  it('parses porcelain status output', () => {
    const status = 'M  src/file.ts\nA  src/new.ts\nD  src/old.ts\n?? untracked.txt';
    const result = parseGitStatus(status);
    expect(result.modified).toBe(1);
    expect(result.added).toBe(1);
    expect(result.deleted).toBe(1);
    expect(result.untracked).toBe(1);
  });

  it('handles empty status', () => {
    const result = parseGitStatus('');
    expect(result).toEqual({ added: 0, modified: 0, deleted: 0, untracked: 0 });
  });

  it('handles all modified', () => {
    const status = 'M  a.ts\nM  b.ts\nM  c.ts';
    const result = parseGitStatus(status);
    expect(result.modified).toBe(3);
  });
});

describe('generateId', () => {
  it('generates a non-empty string', () => {
    const id = generateId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBeGreaterThan(90);
  });
});

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('filters falsy values', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
  });
});
