import { useState, useEffect } from 'react';
import { GitFork, GitBranch, Folder, ArrowRight, Loader2 } from 'lucide-react';
import * as cmd from '../../lib/tauri-commands';
import { cn } from '../../lib/utils';
import type { Worktree } from '../../types';

interface RepoOverviewCardProps {
  repoPath: string;
  isActive: boolean;
  onSwitch: (path: string) => void;
}

export function RepoOverviewCard({ repoPath, isActive, onSwitch }: RepoOverviewCardProps) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [currentBranch, setCurrentBranch] = useState('');
  const [loading, setLoading] = useState(true);

  const repoName = repoPath.split('/').pop() || repoPath;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [wts, branch] = await Promise.all([
          cmd.listWorktrees(repoPath).catch(() => []),
          cmd.getCurrentBranch(repoPath).catch(() => ''),
        ]);
        if (!cancelled) {
          setWorktrees(wts);
          setCurrentBranch(branch);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [repoPath]);

  return (
    <div className={cn(
      'rounded-xl border p-4 transition-all',
      isActive
        ? 'border-indigo-500/30 bg-indigo-500/5'
        : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            'p-1.5 rounded-lg shrink-0',
            isActive ? 'bg-indigo-500/15' : 'bg-white/5'
          )}>
            <Folder className={cn('w-3.5 h-3.5', isActive ? 'text-indigo-400' : 'text-white/40')} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white/90 truncate">{repoName}</h3>
            <p className="text-[11px] text-white/30 truncate">{repoPath}</p>
          </div>
        </div>
        {isActive && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 font-semibold shrink-0">
            ACTIVE
          </span>
        )}
      </div>

      {/* Stats */}
      {loading ? (
        <div className="flex items-center gap-2 text-white/20 text-xs py-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading...
        </div>
      ) : (
        <div className="flex items-center gap-4 mb-3">
          <div className="flex items-center gap-1.5">
            <GitFork className="w-3 h-3 text-white/30" />
            <span className="text-xs text-white/60">{worktrees.length} worktree{worktrees.length !== 1 ? 's' : ''}</span>
          </div>
          {currentBranch && (
            <div className="flex items-center gap-1.5">
              <GitBranch className="w-3 h-3 text-white/30" />
              <span className="text-xs text-white/60 font-mono truncate max-w-[120px]">{currentBranch}</span>
            </div>
          )}
        </div>
      )}

      {/* Switch button */}
      {!isActive && (
        <button
          onClick={() => onSwitch(repoPath)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 transition-colors"
        >
          Switch to repo
          <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
