import { useAppStore } from '../../stores/app-store';
import { WorktreeStatusBadge } from '../worktree/WorktreeStatusBadge';
import { Home } from 'lucide-react';
import { basename } from '../../lib/utils';
import { cn } from '../../lib/utils';

interface WorktreeListProps {
  filter?: string;
}

export function WorktreeList({ filter }: WorktreeListProps) {
  const worktrees = useAppStore(s => s.worktrees);
  const focusedWorktreePath = useAppStore(s => s.focusedWorktreePath);
  const setFocusedWorktreePath = useAppStore(s => s.setFocusedWorktreePath);
  const setActiveTab = useAppStore(s => s.setActiveTab);

  const filteredWorktrees = filter
    ? worktrees.filter(wt => {
        const q = filter.toLowerCase();
        const dirName = basename(wt.path);
        const branchName = wt.branch?.replace('refs/heads/', '') || 'detached';
        return dirName.toLowerCase().includes(q) || branchName.toLowerCase().includes(q) || wt.path.toLowerCase().includes(q);
      })
    : worktrees;

  if (filteredWorktrees.length === 0) return null;

  const handleSelect = (path: string) => {
    setFocusedWorktreePath(path);
    setActiveTab('changes');
  };

  return (
    <div className="border-b border-white/5 px-2 py-2">
      <div className="px-2 py-1 mb-1">
        <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Worktrees</span>
      </div>
      <div className="space-y-0.5">
        {filteredWorktrees.map(wt => {
          const isFocused = wt.path === focusedWorktreePath;
          const dirName = basename(wt.path);
          const branchName = wt.branch?.replace('refs/heads/', '') || 'detached';
          return (
            <button
              key={wt.path}
              type="button"
              onClick={() => handleSelect(wt.path)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors',
                isFocused
                  ? 'bg-indigo-500/15 text-white/90 ring-1 ring-indigo-500/30'
                  : 'hover:bg-white/[0.04] text-white/70'
              )}
            >
              {wt.isMain && <Home className="w-3 h-3 text-indigo-400 shrink-0" />}
              <span className="text-xs font-medium truncate flex-1 min-w-0" title={wt.path}>
                {dirName}
              </span>
              <span className="text-[10px] text-white/40 font-mono truncate max-w-[80px]" title={branchName}>
                {branchName}
              </span>
              <WorktreeStatusBadge status={wt.status} isDetached={wt.is_detached} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
