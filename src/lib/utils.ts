import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function basename(path: string): string {
  return path.split('/').pop() || path;
}

export function truncatePath(path: string, maxLen: number = 50): string {
  if (path.length <= maxLen) return path;
  const parts = path.split('/');
  if (parts.length <= 3) return path;
  return parts[0] + '/.../' + parts.slice(-2).join('/');
}

export function groupBranchesByPrefix<T extends { name: string }>(branches: T[]): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const b of branches) {
    const slashIdx = b.name.indexOf('/');
    const prefix = slashIdx > 0 ? b.name.substring(0, slashIdx) : '_other';
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(b);
  }
  return groups;
}

export function parseGitStatus(status: string): { added: number; modified: number; deleted: number; untracked: number } {
  const lines = status.trim().split('\n').filter(Boolean);
  let added = 0, modified = 0, deleted = 0, untracked = 0;
  for (const line of lines) {
    const code = line.substring(0, 2);
    if (code.includes('A')) added++;
    else if (code.includes('M')) modified++;
    else if (code.includes('D')) deleted++;
    else if (code.includes('?')) untracked++;
  }
  return { added, modified, deleted, untracked };
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}
