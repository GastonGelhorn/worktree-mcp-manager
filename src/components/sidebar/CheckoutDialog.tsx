import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GitBranch, AlertTriangle, Archive, GitFork, ArrowRight, Loader2, ArchiveRestore, Trash2 } from 'lucide-react';
import { useAppStore } from '../../stores/app-store';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import * as cmd from '../../lib/tauri-commands';
import type { StashEntry } from '../../types';

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetBranch: string;
}

type DialogStep = 'choose' | 'stash-found';
type CheckoutAction = 'checkout' | 'stash-checkout' | 'worktree';

export function CheckoutDialog({ open, onOpenChange, targetBranch }: CheckoutDialogProps) {
  const activeRepo = useAppStore(s => s.activeRepo);
  const addToast = useAppStore(s => s.addToast);
  const loadData = useAppStore(s => s.loadData);
  const addWorktree = useAppStore(s => s.addWorktree);

  const [step, setStep] = useState<DialogStep>('choose');
  const [hasChanges, setHasChanges] = useState(false);
  const [currentBranch, setCurrentBranch] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [worktreePath, setWorktreePath] = useState('');
  const [branchStashes, setBranchStashes] = useState<StashEntry[]>([]);
  const [restoringStash, setRestoringStash] = useState<number | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (!open || !activeRepo) return;

    setStep('choose');
    setBranchStashes([]);
    setRestoringStash(null);

    const check = async () => {
      setChecking(true);
      try {
        const [changes, branch] = await Promise.all([
          cmd.hasUncommittedChanges(activeRepo),
          cmd.getCurrentBranch(activeRepo),
        ]);
        setHasChanges(changes);
        setCurrentBranch(branch);

        const repoParent = activeRepo.substring(0, activeRepo.lastIndexOf('/'));
        const repoName = activeRepo.split('/').pop() || 'repo';
        setWorktreePath(`${repoParent}/${repoName}-${targetBranch.replace(/\//g, '-')}`);
      } catch (e: any) {
        addToast('error', 'Failed to check status', e.toString());
      } finally {
        setChecking(false);
      }
    };

    check();
  }, [open, activeRepo, targetBranch, addToast]);

  // After checkout, check for stashes on the target branch
  const checkStashesForBranch = async (branch: string) => {
    try {
      const allStashes = await cmd.listStashes(activeRepo);
      const matching = allStashes.filter(s =>
        s.branch === branch || s.message.includes(branch)
      );
      return matching;
    } catch {
      return [];
    }
  };

  const handleAction = async (action: CheckoutAction) => {
    setLoading(true);
    try {
      if (action === 'checkout') {
        await cmd.gitCheckout(activeRepo, targetBranch);

        // Check for stashes on the target branch
        const stashes = await checkStashesForBranch(targetBranch);
        await loadData();

        if (stashes.length > 0) {
          setBranchStashes(stashes);
          setStep('stash-found');
          setLoading(false);
          return;
        }

        addToast('success', 'Branch switched', `Now on ${targetBranch}`);
      } else if (action === 'stash-checkout') {
        await cmd.gitStash(activeRepo, `Auto-stash before switching to ${targetBranch}`);
        await cmd.gitCheckout(activeRepo, targetBranch);

        // Check for stashes on the target branch
        const stashes = await checkStashesForBranch(targetBranch);
        await loadData();

        if (stashes.length > 0) {
          setBranchStashes(stashes);
          setStep('stash-found');
          setLoading(false);
          return;
        }

        addToast('success', 'Changes stashed & branch switched', `Stashed changes from ${currentBranch}, now on ${targetBranch}`);
      } else if (action === 'worktree') {
        if (!worktreePath.trim()) {
          addToast('error', 'Path required', 'Enter a path for the new worktree');
          setLoading(false);
          return;
        }
        await addWorktree(worktreePath.trim(), targetBranch, false, false, null, false, true, false);
        addToast('success', 'Worktree created', `Created worktree for ${targetBranch} at ${worktreePath.split('/').pop()}`);
      }

      onOpenChange(false);
    } catch (e: any) {
      addToast('error', 'Operation failed', e.toString());
    } finally {
      setLoading(false);
    }
  };

  const handlePopStash = async (stash: StashEntry) => {
    setRestoringStash(stash.index);
    try {
      await cmd.gitStashPop(activeRepo, stash.index);
      setBranchStashes(prev => prev.filter(s => s.index !== stash.index));
      await loadData();
      addToast('success', 'Stash restored', `Applied stash: ${stash.message}`);

      // If no more stashes, close
      if (branchStashes.length <= 1) {
        onOpenChange(false);
      }
    } catch (e: any) {
      addToast('error', 'Failed to pop stash', e.toString());
    } finally {
      setRestoringStash(null);
    }
  };

  const handleDropStash = async (stash: StashEntry) => {
    setRestoringStash(stash.index);
    try {
      await cmd.gitStashDrop(activeRepo, stash.index);
      setBranchStashes(prev => prev.filter(s => s.index !== stash.index));
      addToast('info', 'Stash dropped', `Discarded stash: ${stash.message}`);

      if (branchStashes.length <= 1) {
        onOpenChange(false);
      }
    } catch (e: any) {
      addToast('error', 'Failed to drop stash', e.toString());
    } finally {
      setRestoringStash(null);
    }
  };

  const handleSkipStashes = () => {
    addToast('success', 'Branch switched', `Now on ${targetBranch}`);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount container={document.body}>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                style={{ zIndex: 9998 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <div
                className="fixed inset-0 flex items-center justify-center"
                style={{ zIndex: 9999 }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="w-full max-w-lg bg-surface-3 border border-white/10 rounded-xl shadow-2xl"
                >

                  {/* === STEP 1: Choose action === */}
                  {step === 'choose' && (
                    <>
                      <div className="flex items-center justify-between p-5 border-b border-white/5">
                        <Dialog.Title className="text-base font-medium text-white/90 flex items-center gap-2">
                          <GitBranch className="w-4 h-4 text-indigo-400" />
                          Switch to {targetBranch}
                        </Dialog.Title>
                        <Dialog.Close asChild>
                          <button className="text-white/30 hover:text-white/60 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </Dialog.Close>
                      </div>

                      <div className="p-5">
                        {checking ? (
                          <div className="flex items-center gap-3 text-white/50 text-sm py-4">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Checking working tree status...
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 text-sm text-white/60 mb-4">
                              <span className="font-mono text-white/80">{currentBranch}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-white/30" />
                              <span className="font-mono text-indigo-400">{targetBranch}</span>
                            </div>

                            {/* No changes */}
                            {!hasChanges && (
                              <div className="flex flex-col gap-3">
                                <p className="text-sm text-white/50">
                                  Your working tree is clean. You can switch branches safely.
                                </p>
                                <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
                                  <Dialog.Close asChild>
                                    <Button variant="ghost" size="sm" type="button">Cancel</Button>
                                  </Dialog.Close>
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    disabled={loading}
                                    onClick={() => handleAction('checkout')}
                                  >
                                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
                                    Checkout
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Has changes */}
                            {hasChanges && (
                              <div className="flex flex-col gap-4">
                                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
                                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-sm text-amber-200 font-medium">You have uncommitted changes</p>
                                    <p className="text-xs text-amber-200/60 mt-0.5">
                                      Choose how to handle your changes on <span className="font-mono">{currentBranch}</span> before switching.
                                    </p>
                                  </div>
                                </div>

                                <button
                                  onClick={() => handleAction('stash-checkout')}
                                  disabled={loading}
                                  className="flex items-start gap-3 p-3 rounded-lg border border-white/5 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all text-left group"
                                >
                                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0 group-hover:bg-indigo-500/20 transition-colors">
                                    <Archive className="w-4 h-4 text-indigo-400" />
                                  </div>
                                  <div>
                                    <p className="text-sm text-white/80 font-medium">Stash changes & switch</p>
                                    <p className="text-xs text-white/40 mt-0.5">
                                      Save your changes to the stash, then checkout <span className="font-mono text-white/50">{targetBranch}</span>.
                                    </p>
                                  </div>
                                </button>

                                <div className="flex flex-col gap-2 p-3 rounded-lg border border-white/5 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all">
                                  <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                      <GitFork className="w-4 h-4 text-emerald-400" />
                                    </div>
                                    <div>
                                      <p className="text-sm text-white/80 font-medium">Keep both — create a worktree</p>
                                      <p className="text-xs text-white/40 mt-0.5">
                                        Stay on <span className="font-mono text-white/50">{currentBranch}</span> with your changes, and open <span className="font-mono text-white/50">{targetBranch}</span> in a new worktree.
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex gap-2 ml-11">
                                    <Input
                                      value={worktreePath}
                                      onChange={e => setWorktreePath(e.target.value)}
                                      placeholder="Worktree path..."
                                      className="text-xs py-1.5 flex-1"
                                    />
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      disabled={loading || !worktreePath.trim()}
                                      onClick={() => handleAction('worktree')}
                                    >
                                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
                                    </Button>
                                  </div>
                                </div>

                                <div className="flex justify-end pt-2 border-t border-white/5">
                                  <Dialog.Close asChild>
                                    <Button variant="ghost" size="sm" type="button">Cancel</Button>
                                  </Dialog.Close>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}

                  {/* === STEP 2: Stashes found after checkout === */}
                  {step === 'stash-found' && (
                    <>
                      <div className="flex items-center justify-between p-5 border-b border-white/5">
                        <Dialog.Title className="text-base font-medium text-white/90 flex items-center gap-2">
                          <ArchiveRestore className="w-4 h-4 text-amber-400" />
                          Stashed changes found
                        </Dialog.Title>
                        <button
                          onClick={handleSkipStashes}
                          className="text-white/30 hover:text-white/60 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-5 flex flex-col gap-4">
                        <div className="flex items-start gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-3 py-2.5">
                          <Archive className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-cyan-200 font-medium">
                              {branchStashes.length} stash{branchStashes.length !== 1 ? 'es' : ''} found for {targetBranch}
                            </p>
                            <p className="text-xs text-cyan-200/60 mt-0.5">
                              You previously stashed changes on this branch. Would you like to restore them?
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
                          {branchStashes.map(stash => (
                            <div
                              key={stash.index}
                              className="flex items-center justify-between gap-3 p-3 rounded-lg border border-white/5 bg-white/[0.02]"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white/70 truncate">{stash.message}</p>
                                <p className="text-[10px] text-white/30 font-mono mt-0.5">stash@{'{' + stash.index + '}'}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  disabled={restoringStash !== null}
                                  onClick={() => handlePopStash(stash)}
                                >
                                  {restoringStash === stash.index ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <ArchiveRestore className="w-3.5 h-3.5" />
                                  )}
                                  Restore
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={restoringStash !== null}
                                  onClick={() => handleDropStash(stash)}
                                  title="Discard this stash"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-end pt-2 border-t border-white/5">
                          <Button variant="ghost" size="sm" onClick={handleSkipStashes}>
                            Skip — keep stashes for later
                          </Button>
                        </div>
                      </div>
                    </>
                  )}

                </motion.div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
