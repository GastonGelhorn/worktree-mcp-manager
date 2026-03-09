import { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import * as cmd from '../../lib/tauri-commands';
import { AlertTriangle, Trash2, GitBranch } from 'lucide-react';
import { basename } from '../../lib/utils';
import type { WorktreeEnriched } from '../../types';

interface RemoveWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: WorktreeEnriched;
}

export function RemoveWorktreeDialog({ open, onOpenChange, worktree }: RemoveWorktreeDialogProps) {
  const activeRepo = useAppStore(s => s.activeRepo);
  const loadData = useAppStore(s => s.loadData);
  const addToast = useAppStore(s => s.addToast);
  const [deleteBranch, setDeleteBranch] = useState(false);
  const [loading, setLoading] = useState(false);

  const branchName = worktree.branch?.replace('refs/heads/', '') || '';
  const dirName = basename(worktree.path);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      // 1. Remove the worktree
      await cmd.removeWorktree(activeRepo, worktree.path);

      // 2. Optionally delete the branch
      if (deleteBranch && branchName) {
        try {
          await cmd.deleteBranch(activeRepo, branchName, true);
          addToast('success', 'Worktree & branch removed', `Removed ${dirName} and deleted branch ${branchName}`);
        } catch (e: any) {
          addToast('warning', 'Worktree removed, branch deletion failed', e.toString());
        }
      } else {
        addToast('success', 'Worktree removed', `Removed ${dirName}`);
      }

      await loadData();
      onOpenChange(false);
    } catch (e: any) {
      addToast('error', 'Failed to remove worktree', e.toString());
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />

      {/* Dialog */}
      <div className="relative bg-surface-2 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4">
        {/* Icon */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-red-500/10">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white/90">Remove Worktree</h3>
            <p className="text-xs text-white/40 mt-0.5">This action cannot be undone</p>
          </div>
        </div>

        {/* Content */}
        <div className="mb-5">
          <p className="text-xs text-white/50 leading-relaxed">
            Are you sure you want to remove the worktree <span className="text-white/80 font-medium">{dirName}</span> at{' '}
            <span className="font-mono text-white/40 break-all">{worktree.path}</span>?
          </p>

          {/* Delete branch option */}
          {branchName && branchName !== 'main' && branchName !== 'master' && (
            <label className="flex items-start gap-3 mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/5 cursor-pointer hover:bg-white/[0.05] transition-colors">
              <input
                type="checkbox"
                checked={deleteBranch}
                onChange={e => setDeleteBranch(e.target.checked)}
                className="mt-0.5 rounded border-white/20 bg-white/5 text-red-500 focus:ring-red-500/30"
              />
              <div>
                <div className="flex items-center gap-1.5 text-xs text-white/70 font-medium">
                  <GitBranch className="w-3 h-3 text-red-400" />
                  Also delete branch <span className="font-mono text-red-400/80">{branchName}</span>
                </div>
                <p className="text-[11px] text-white/30 mt-1">
                  Force-deletes the local branch. This cannot be undone.
                </p>
              </div>
            </label>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="px-4 py-2 text-xs font-medium text-white/50 hover:text-white/70 rounded-lg hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-red-500/15 text-red-400 rounded-lg hover:bg-red-500/25 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {loading ? 'Removing...' : deleteBranch ? 'Remove worktree & branch' : 'Remove worktree'}
          </button>
        </div>
      </div>
    </div>
  );
}
