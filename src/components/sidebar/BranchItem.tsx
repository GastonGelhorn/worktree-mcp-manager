import { GitBranch, FolderGit2, FolderPlus } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Branch } from '../../types';

interface BranchItemProps {
  branch: Branch;
  hasWorktree: boolean;
  indent?: boolean;
  remote?: boolean;
  onClick?: () => void;
  onCreateWorktree?: () => void;
}

export function BranchItem({ branch, hasWorktree, indent, remote, onClick, onCreateWorktree }: BranchItemProps) {
  const isClickable = !branch.is_current && !remote;

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      className={cn(
        'flex items-center gap-2 px-2 py-1 rounded-md transition-all duration-150 group',
        indent && 'ml-3',
        branch.is_current
          ? 'bg-indigo-500/10 text-indigo-400'
          : remote
            ? 'text-white/30 hover:bg-white/[0.02] hover:text-white/40'
            : 'text-white/60 hover:bg-white/5 hover:text-white/80 cursor-pointer',
      )}
    >
      <GitBranch className="w-3 h-3 shrink-0" />
      <span className="truncate text-xs">{branch.name}</span>

      <div className="flex items-center gap-1.5 ml-auto shrink-0">
        {/* Create worktree button — only for local branches without a worktree */}
        {!hasWorktree && !remote && !branch.is_current && onCreateWorktree && (
          <button
            onClick={(e) => { e.stopPropagation(); onCreateWorktree(); }}
            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[9px] text-white/40 hover:text-emerald-400 hover:bg-emerald-500/10 px-1.5 py-0.5 rounded transition-all"
            title="Create worktree for this branch"
          >
            <FolderPlus className="w-2.5 h-2.5" />
            WT
          </button>
        )}
        {hasWorktree && (
          <span className="flex items-center gap-1 text-[9px] bg-emerald-500/10 text-emerald-400/80 px-1.5 py-0.5 rounded">
            <FolderGit2 className="w-2.5 h-2.5" />
            WT
          </span>
        )}
        {branch.is_current && (
          <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-1 py-0.5 rounded uppercase tracking-wider">
            HEAD
          </span>
        )}
      </div>
    </div>
  );
}
