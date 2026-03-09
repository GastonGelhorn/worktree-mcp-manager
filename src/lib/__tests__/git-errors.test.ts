import { describe, it, expect } from 'vitest';
import { parseGitError } from '../git-errors';

describe('parseGitError', () => {
  it('maps "not a git repository" error', () => {
    expect(parseGitError('fatal: not a git repository (or any of the parent directories): .git'))
      .toBe('This directory is not a git repository.');
  });

  it('maps "already checked out" error', () => {
    expect(parseGitError("fatal: 'feature/auth' is already checked out at '/Users/dev/wt'"))
      .toBe('This branch is already checked out in another worktree.');
  });

  it('maps "invalid branch name" error', () => {
    expect(parseGitError("fatal: 'bad..name' is not a valid branch name"))
      .toBe('Invalid branch name.');
  });

  it('maps "pathspec did not match" error', () => {
    expect(parseGitError("error: pathspec 'foo' did not match any file(s) known to git"))
      .toBe('The specified path or branch was not found.');
  });

  it('maps conflict error', () => {
    expect(parseGitError('CONFLICT (content): Merge conflict in file.ts'))
      .toBe('Merge conflict detected. Resolve conflicts before continuing.');
  });

  it('maps permission denied error', () => {
    expect(parseGitError('error: Permission denied'))
      .toBe('Permission denied. Check file permissions.');
  });

  it('maps "already exists" error', () => {
    expect(parseGitError("fatal: 'my-wt' already exists"))
      .toBe('A worktree or branch with that name already exists.');
  });

  it('maps bare repository error', () => {
    expect(parseGitError('fatal: this operation must be run in a work tree, is a bare repository'))
      .toBe('Cannot perform this operation on a bare repository.');
  });

  it('returns original message for unknown errors', () => {
    const msg = 'some unknown git error occurred';
    expect(parseGitError(msg)).toBe(msg);
  });

  it('handles empty string', () => {
    expect(parseGitError('')).toBe('');
  });
});
