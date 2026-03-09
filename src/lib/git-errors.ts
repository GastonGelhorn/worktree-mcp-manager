const GIT_ERROR_PATTERNS: [RegExp, string][] = [
  [/fatal: not a git repository/, 'This directory is not a git repository.'],
  [/already checked out/, 'This branch is already checked out in another worktree.'],
  [/is not a valid branch name/, 'Invalid branch name.'],
  [/pathspec .* did not match/, 'The specified path or branch was not found.'],
  [/CONFLICT/, 'Merge conflict detected. Resolve conflicts before continuing.'],
  [/cannot force update the current branch/, 'Cannot force-update the branch you are currently on.'],
  [/not something we can merge/, 'The specified reference cannot be merged.'],
  [/already exists/, 'A worktree or branch with that name already exists.'],
  [/is a bare repository/, 'Cannot perform this operation on a bare repository.'],
  [/Permission denied/, 'Permission denied. Check file permissions.'],
];

export function parseGitError(stderr: string): string {
  for (const [pattern, message] of GIT_ERROR_PATTERNS) {
    if (pattern.test(stderr)) return message;
  }
  return stderr;
}
