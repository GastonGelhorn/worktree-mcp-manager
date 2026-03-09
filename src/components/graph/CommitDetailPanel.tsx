import { X, GitBranch, GitCommit, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GraphCommit } from '../../types';
import { useAppStore } from '../../stores/app-store';
import { cn } from '../../lib/utils';

interface CommitDetailPanelProps {
  commit: GraphCommit | null;
  onClose: () => void;
  onCheckout: (branch: string) => void;
  onCreateWorktree: (branch: string) => void;
  worktreeBranches: Set<string>;
}

export function CommitDetailPanel({
  commit,
  onClose,
  onCheckout,
  onCreateWorktree,
  worktreeBranches,
}: CommitDetailPanelProps) {
  const [copiedHash, setCopiedHash] = useState(false);
  const addToast = useAppStore(s => s.addToast);

  const copyHash = async () => {
    if (!commit) return;
    try {
      await navigator.clipboard.writeText(commit.hash);
      setCopiedHash(true);
      addToast('success', 'Hash copied');
      setTimeout(() => setCopiedHash(false), 2000);
    } catch {
      addToast('error', 'Failed to copy');
    }
  };

  const cleanBranch = (b: string) => b.replace('refs/heads/', '').replace('origin/', '');

  return (
    <AnimatePresence>
      {commit && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-80 border-l border-white/5 bg-gray-950/90 backdrop-blur-sm flex flex-col shrink-0 overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider">Commit Details</h3>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Hash */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Hash</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-xs font-mono text-cyan-400">{commit.short_hash}</code>
                <button onClick={copyHash} className="p-0.5 rounded hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors">
                  {copiedHash ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Message</label>
              <p className="text-xs text-white/80 mt-1 leading-relaxed">{commit.message}</p>
            </div>

            {/* Author & Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Author</label>
                <p className="text-xs text-white/60 mt-1">{commit.author}</p>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Date</label>
                <p className="text-xs text-white/60 mt-1">{commit.date}</p>
              </div>
            </div>

            {/* Parents */}
            {commit.parents.length > 0 && (
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">
                  Parents ({commit.parents.length})
                </label>
                <div className="mt-1 space-y-1">
                  {commit.parents.map(p => (
                    <code key={p} className="block text-[11px] font-mono text-white/40">{p.substring(0, 10)}</code>
                  ))}
                </div>
              </div>
            )}

            {/* Branches */}
            {commit.branches.length > 0 && (
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Branches</label>
                <div className="mt-2 space-y-1.5">
                  {commit.branches.map(b => {
                    const clean = cleanBranch(b);
                    const hasWt = worktreeBranches.has(clean);
                    return (
                      <div key={b} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <GitBranch className="w-3 h-3 text-white/30 shrink-0" />
                          <span className={cn(
                            'text-xs font-mono truncate',
                            hasWt ? 'text-cyan-400' : 'text-white/60'
                          )}>
                            {clean}
                          </span>
                          {hasWt && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-400 shrink-0">WT</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => onCheckout(clean)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
                          >
                            checkout
                          </button>
                          {!hasWt && (
                            <button
                              onClick={() => onCreateWorktree(clean)}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                            >
                              + worktree
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 border-t border-white/5">
              <button
                onClick={() => onCreateWorktree(commit.short_hash)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/10 text-indigo-400 text-xs font-medium hover:bg-indigo-500/20 transition-colors"
              >
                <GitCommit className="w-3.5 h-3.5" />
                Create Worktree from this commit
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
