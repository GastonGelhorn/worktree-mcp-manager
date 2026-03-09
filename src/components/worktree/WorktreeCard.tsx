import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { open } from '@tauri-apps/plugin-shell';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { WorktreeStatusBadge } from './WorktreeStatusBadge';
import { CiStatusBadge } from './CiStatusBadge';
import { WorktreeStateBadge } from './WorktreeStateBadge';
import { WorktreeActions } from './WorktreeActions';
import { DiffViewer } from './DiffViewer';
import { RemoveWorktreeDialog } from './RemoveWorktreeDialog';
import { useAppStore } from '../../stores/app-store';
import * as cmd from '../../lib/tauri-commands-new';
import { GitBranch, Clock, User, Lock, AlertTriangle, Home, Link, Loader2 } from 'lucide-react';
import { basename } from '../../lib/utils';
import type { WorktreeEnriched } from '../../types';
import type { CiStatus, WorktreeState, WorktreeStatus } from '../../types/new-types';

interface WorktreeCardProps {
  worktree: WorktreeEnriched;
  index: number;
}

export function WorktreeCard({ worktree, index }: WorktreeCardProps) {
  const framework = useAppStore(s => s.framework);
  const viewMode = useAppStore(s => s.viewMode);
  const activeRepo = useAppStore(s => s.activeRepo);
  const setFocusedWorktreePath = useAppStore(s => s.setFocusedWorktreePath);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ciStatus, setCiStatus] = useState<CiStatus>('None');
  const [wtState, setWtState] = useState<WorktreeState | null>(null);
  const [loadingState, setLoadingState] = useState(false);

  useEffect(() => {
    const loadCiAndState = async () => {
      if (!activeRepo) return;

      setLoadingState(true);
      try {
        // Load CI status
        const branchName = worktree.branch?.replace('refs/heads/', '') || 'detached';
        const ciResult = await cmd.getCiStatus(activeRepo, branchName);
        setCiStatus(ciResult.ci_status);

        // Load worktree state
        const state = await cmd.getWorktreeState(worktree.path);
        setWtState(state);
      } catch (e) {
        console.error('Failed to load CI status or worktree state:', e);
      } finally {
        setLoadingState(false);
      }
    };

    loadCiAndState();
  }, [worktree.path, worktree.branch, activeRepo]);

  const branchName = worktree.branch?.replace('refs/heads/', '') || 'detached';
  const dirName = basename(worktree.path);
  const isList = viewMode === 'list';
  const isMain = worktree.isMain === true;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: isList ? 4 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: index * 0.03 }}
      >
        {isList ? (
          /* ── Compact List Row: click goes to Changes ── */
          <Card hover className="overflow-hidden">
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setFocusedWorktreePath(worktree.path);
                setActiveTab('changes');
              }}
              onKeyDown={e => e.key === 'Enter' && (setFocusedWorktreePath(worktree.path), setActiveTab('changes'))}
              className="px-4 py-2.5 flex items-center gap-4 cursor-pointer"
            >
              {/* Name */}
              <div className="flex items-center gap-2 min-w-0 w-[180px] shrink-0">
                <h3 className="text-sm font-medium text-white/90 truncate">{dirName}</h3>
                {isMain && <Home className="w-3 h-3 text-indigo-400 shrink-0" />}
                {worktree.is_locked && <Lock className="w-3 h-3 text-amber-400 shrink-0" />}
                {worktree.prunable && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
              </div>

              {/* Branch */}
              <Badge variant="default">
                <GitBranch className="w-3 h-3" />
                {branchName}
              </Badge>

              {/* CI Status */}
              {loadingState ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40" />
                </div>
              ) : (
                <CiStatusBadge status={ciStatus} />
              )}

              {/* Status */}
              <WorktreeStatusBadge status={worktree.status} isDetached={worktree.is_detached} />

              {/* Worktree State */}
              {wtState && (
                <WorktreeStateBadge
                  status={wtState.status as WorktreeStatus}
                  counts={{
                    staged: wtState.staged_count,
                    modified: wtState.modified_count,
                    untracked: wtState.untracked_count,
                    conflicted: wtState.conflicting_files.length,
                  }}
                />
              )}

              {isMain && (
                <span className="text-[9px] bg-indigo-500/15 text-indigo-400/80 px-1.5 py-0.5 rounded font-medium">
                  BASE
                </span>
              )}

              {framework.is_laravel && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    open(`http://${dirName}.test`);
                  }}
                  className="bg-[#FF2D20]/10 hover:bg-[#FF2D20]/20 text-[#FF2D20] px-2 py-0.5 rounded text-[10px] font-medium border border-[#FF2D20]/20 flex items-center gap-1.5 transition-colors shrink-0"
                >
                  <Link className="w-3 h-3" />
                  {dirName}.test
                </button>
              )}

              {/* Last commit (compressed) */}
              {worktree.lastCommit && (
                <div className="flex items-center gap-2 text-xs text-white/35 min-w-0 flex-1 truncate">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span className="truncate">{worktree.lastCommit.message}</span>
                  <span className="shrink-0 text-white/20">{worktree.lastCommit.date}</span>
                </div>
              )}

              {/* Path */}
              <span className="text-[11px] font-mono text-white/20 truncate max-w-[200px] shrink-0" title={worktree.path}>
                {worktree.path}
              </span>

              {/* Actions: stop propagation so click doesn't navigate */}
              <div onClick={e => e.stopPropagation()} className="shrink-0">
                <WorktreeActions worktree={worktree} onRequestDelete={isMain ? undefined : () => setConfirmDelete(true)} />
              </div>
            </div>
          </Card>
        ) : (
          /* ── Full Grid Card ── */
          <Card hover className="p-4 flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-white/90 truncate">{dirName}</h3>
                  {isMain && <Home className="w-3 h-3 text-indigo-400 shrink-0" />}
                  {worktree.is_locked && (
                    <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                  )}
                  {worktree.prunable && (
                    <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-white/30 truncate mt-0.5 font-mono" title={worktree.path}>
                  {worktree.path}
                </p>
              </div>
              <WorktreeActions worktree={worktree} onRequestDelete={isMain ? undefined : () => setConfirmDelete(true)} />
            </div>

            {/* Badges Row */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="default">
                <GitBranch className="w-3 h-3" />
                {branchName}
              </Badge>
              {loadingState ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40" />
                </div>
              ) : (
                <CiStatusBadge status={ciStatus} />
              )}
              <WorktreeStatusBadge status={worktree.status} isDetached={worktree.is_detached} />
              {wtState && (
                <WorktreeStateBadge
                  status={wtState.status as WorktreeStatus}
                  counts={{
                    staged: wtState.staged_count,
                    modified: wtState.modified_count,
                    untracked: wtState.untracked_count,
                    conflicted: wtState.conflicting_files.length,
                  }}
                />
              )}
              {isMain && (
                <span className="text-[9px] bg-indigo-500/15 text-indigo-400/80 px-1.5 py-0.5 rounded font-medium">
                  Base repo
                </span>
              )}
              {framework.is_laravel && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    open(`http://${dirName}.test`);
                  }}
                  className="bg-[#FF2D20]/10 hover:bg-[#FF2D20]/20 text-[#FF2D20] px-2 py-0.5 rounded text-[10px] font-medium border border-[#FF2D20]/20 flex items-center gap-1.5 transition-colors shrink-0"
                >
                  <Link className="w-3 h-3" />
                  {dirName}.test
                </button>
              )}
            </div>

            {/* Last Commit Info */}
            {worktree.lastCommit && (
              <div className="flex items-center gap-3 text-xs text-white/40 pt-1 border-t border-white/5">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span className="truncate">{worktree.lastCommit.message}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <User className="w-3 h-3" />
                  <span>{worktree.lastCommit.author}</span>
                </div>
                <span className="shrink-0 text-white/25">{worktree.lastCommit.date}</span>
              </div>
            )}

            {/* Changed Files */}
            <DiffViewer status={worktree.status} />
          </Card>
        )}
      </motion.div>

      <RemoveWorktreeDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        worktree={worktree}
      />
    </>
  );
}
