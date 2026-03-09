import { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import * as cmd from '../../lib/tauri-commands-new';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { AlertTriangle, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { MergeStrategy, MergeDryRunResult } from '../../types/new-types';

interface MergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  wtPath: string;
  sourceBranch: string;
  onSuccess?: () => void;
}

export function MergeDialog({
  open,
  onOpenChange,
  repoPath,
  wtPath,
  sourceBranch,
  onSuccess,
}: MergeDialogProps) {
  const addToast = useAppStore(s => s.addToast);

  const [strategy, setStrategy] = useState<MergeStrategy>('Merge');
  const [targetBranch, setTargetBranch] = useState('main');
  const [dryRun, setDryRun] = useState(false);
  const [generateMessage, setGenerateMessage] = useState(true);
  const [autoCleanup, setAutoCleanup] = useState(false);

  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<MergeDryRunResult | null>(null);

  const handleCheckDryRun = async () => {
    if (!dryRun) {
      setDryRunResult(null);
      return;
    }

    setDryRunLoading(true);
    try {
      const result = await cmd.mergeDryRun(repoPath, sourceBranch, targetBranch, strategy);
      setDryRunResult(result);
      if (result.will_conflict) {
        addToast('warning', 'Merge not possible', `${result.conflicting_files.length} conflict(s) detected`);
      }
    } catch (e: any) {
      addToast('error', 'Dry-run failed', e.toString());
      setDryRunResult(null);
    } finally {
      setDryRunLoading(false);
    }
  };

  const handleMerge = async () => {
    try {
      const result = await cmd.mergeWithStrategy(
        repoPath,
        wtPath,
        targetBranch,
        sourceBranch,
        strategy,
        autoCleanup
      );

      addToast('success', 'Merge successful', result.message);
      onOpenChange(false);
      setDryRunResult(null);
      onSuccess?.();
    } catch (e: any) {
      addToast('error', 'Merge failed', e.toString());
    }
  };

  return (
    <>
      <ConfirmDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Merge Branches"
        description={
          <div className="flex flex-col gap-4 mt-3">
            {/* Source and Target */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/50 block mb-1.5">Source Branch</label>
                <div className="bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90 font-mono">
                  {sourceBranch}
                </div>
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1.5">Target Branch</label>
                <input
                  type="text"
                  value={targetBranch}
                  onChange={e => setTargetBranch(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90 outline-none focus:border-indigo-500/50"
                  placeholder="e.g. main"
                />
              </div>
            </div>

            {/* Strategy Selector */}
            <div>
              <label className="text-xs text-white/50 block mb-1.5">Merge Strategy</label>
              <select
                value={strategy}
                onChange={e => setStrategy(e.target.value as MergeStrategy)}
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90 outline-none focus:border-indigo-500/50 cursor-pointer"
              >
                <option value="Merge">Merge (create merge commit)</option>
                <option value="Squash">Squash (combine commits)</option>
                <option value="Rebase">Rebase (linear history)</option>
                <option value="FastForward">Fast-Forward (if possible)</option>
              </select>
            </div>

            {/* Options */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={e => {
                    setDryRun(e.target.checked);
                    if (!e.target.checked) {
                      setDryRunResult(null);
                    } else {
                      handleCheckDryRun();
                    }
                  }}
                  className="w-4 h-4 rounded border-white/10 text-indigo-500"
                />
                <span className="text-sm text-white/70">Preview changes (dry-run)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateMessage}
                  onChange={e => setGenerateMessage(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 text-indigo-500"
                />
                <span className="text-sm text-white/70">Generate commit message</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCleanup}
                  onChange={e => setAutoCleanup(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 text-indigo-500"
                />
                <span className="text-sm text-white/70">Auto-cleanup worktree after merge</span>
              </label>
            </div>

            {/* Dry-Run Result Preview */}
            {dryRun && (
              <div className="border border-white/10 rounded-lg p-3 bg-black/20">
                {dryRunLoading ? (
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing merge...
                  </div>
                ) : dryRunResult ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      {!dryRunResult.will_conflict ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm text-white/70 font-medium">Merge is possible</p>
                            <p className="text-xs text-white/50 mt-0.5">
                              {dryRunResult.files_changed} files changed, {dryRunResult.insertions} insertions,{' '}
                              {dryRunResult.deletions} deletions
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm text-white/70 font-medium">Conflicts detected</p>
                            <p className="text-xs text-white/50 mt-0.5">
                              {dryRunResult.conflicting_files.length} conflict(s) in:
                            </p>
                            <div className="mt-2 space-y-1">
                              {dryRunResult.conflicting_files.slice(0, 3).map((filePath, i) => (
                                <div key={i} className="text-xs text-red-400/70 font-mono flex items-center gap-1">
                                  <span>→</span>
                                  <span>{filePath}</span>
                                </div>
                              ))}
                              {dryRunResult.conflicting_files.length > 3 && (
                                <p className="text-xs text-white/40">
                                  and {dryRunResult.conflicting_files.length - 3} more...
                                </p>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Warning */}
            <div className="flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-500/80">
                This action merges{' '}
                {strategy === 'Merge'
                  ? 'with a merge commit'
                  : strategy === 'Squash'
                  ? 'and squashes commits'
                  : strategy === 'Rebase'
                  ? 'and rebases'
                  : 'with fast-forward if possible'}
                . Make sure all changes are committed.
              </p>
            </div>
          </div>
        }
        confirmLabel="Merge"
        variant="destructive"
        onConfirm={handleMerge}
      />
    </>
  );
}
