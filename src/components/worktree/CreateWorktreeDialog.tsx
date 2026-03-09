import { useState, useEffect, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, GitBranch, FolderOpen, Link, Search, FileStack } from 'lucide-react';
import { useAppStore } from '../../stores/app-store';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { cn, basename } from '../../lib/utils';
import type { WorktreeTemplate } from '../../types/templates';

interface CreateWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a branch when opening from branch list */
  preselectedBranch?: string;
}

type Mode = 'existing' | 'new';

export function CreateWorktreeDialog({ open, onOpenChange, preselectedBranch }: CreateWorktreeDialogProps) {
  const addWorktree = useAppStore(s => s.addWorktree);
  const branches = useAppStore(s => s.branches);
  const worktrees = useAppStore(s => s.worktrees);
  const activeRepo = useAppStore(s => s.activeRepo);
  const framework = useAppStore(s => s.framework);
  const templates = useAppStore(s => s.templates);
  const loading = useAppStore(s => s.loading);

  const [mode, setMode] = useState<Mode>('existing');
  const [branch, setBranch] = useState('');
  const [path, setPath] = useState('');
  const [pathManuallyEdited, setPathManuallyEdited] = useState(false);
  const [herdLink, setHerdLink] = useState(true);
  const [branchFilter, setBranchFilter] = useState('');

  // Performance & Automation State
  const [copyConfigs, setCopyConfigs] = useState(true);
  const [postCreateCommand, setPostCreateCommand] = useState('');

  // Laravel Optimizations State
  const [dbStrategy, setDbStrategy] = useState<'shared' | 'isolated' | 'cloned'>('shared');
  const [dbName, setDbName] = useState('');
  const [assignVitePort, setAssignVitePort] = useState(true);

  const applyTemplate = (t: WorktreeTemplate) => {
    setHerdLink(t.herdLink);
    setDbStrategy(t.dbStrategy as 'shared' | 'isolated' | 'cloned' ?? 'shared');
    setAssignVitePort(t.assignVitePort);
    if (t.branchPrefix && !branch) {
      setBranch(t.branchPrefix);
      setMode('new');
    }
  };

  // Branches that already have a worktree
  const branchesWithWorktree = useMemo(() => {
    const set = new Set<string>();
    for (const wt of worktrees) {
      if (wt.branch) set.add(wt.branch.replace('refs/heads/', ''));
    }
    return set;
  }, [worktrees]);

  // Available local branches (not yet used as worktrees)
  const availableBranches = useMemo(() => {
    return branches
      .filter(b => !b.is_remote && !branchesWithWorktree.has(b.name))
      .map(b => b.name);
  }, [branches, branchesWithWorktree]);

  // Filtered branches for search
  const filteredBranches = useMemo(() => {
    if (!branchFilter) return availableBranches;
    const q = branchFilter.toLowerCase();
    return availableBranches.filter(b => b.toLowerCase().includes(q));
  }, [availableBranches, branchFilter]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      if (preselectedBranch) {
        setBranch(preselectedBranch);
        setMode(availableBranches.includes(preselectedBranch) ? 'existing' : 'new');
      } else {
        setBranch('');
        setMode(availableBranches.length > 0 ? 'existing' : 'new');
      }
      setPath('');
      setPathManuallyEdited(false);
      setBranchFilter('');
      setHerdLink(true);
      setCopyConfigs(true);
      setPostCreateCommand('');
      setDbStrategy('shared');
      setAssignVitePort(true);
    }
  }, [open, preselectedBranch, availableBranches]);

  // Auto-fill path & db name when typing a new branch name (only if not manually edited)
  useEffect(() => {
    if (!branch || !activeRepo || pathManuallyEdited) return;

    const repoName = basename(activeRepo);
    const safeBranch = branch.replace(/\//g, '-');

    // Auto-generate a safe DB name: project_branch 
    setDbName(`${repoName}_${safeBranch}`.replace(/[^a-zA-Z0-9_]/g, '_'));

    const parentDir = activeRepo.substring(0, activeRepo.lastIndexOf('/'));
    setPath(`${parentDir}/${repoName}-${safeBranch}`);
  }, [branch, activeRepo, pathManuallyEdited]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branch.trim() || !path.trim()) return;
    const isNewBranch = mode === 'new';
    const isCloned = dbStrategy === 'cloned';
    const isIsolated = dbStrategy === 'isolated' || isCloned;
    const finalDbName = framework.is_laravel && isIsolated ? dbName.trim() : null;

    // Store the post command globally so the slice can execute it
    useAppStore.setState({ postCreateWorktreeCommand: postCreateCommand.trim() });

    await addWorktree(
      path.trim(),
      branch.trim(),
      isNewBranch,
      herdLink,
      finalDbName,
      framework.is_laravel && assignVitePort,
      copyConfigs,
      isCloned
    );
    onOpenChange(false);
  };

  const selectBranch = (name: string) => {
    setBranch(name);
    setPathManuallyEdited(false);

    // Explicitly compute and set to avoid useEffect race conditions
    if (activeRepo) {
      const repoName = basename(activeRepo);
      const safeBranch = name.replace(/\//g, '-');
      setDbName(`${repoName}_${safeBranch}`.replace(/[^a-zA-Z0-9_]/g, '_'));

      const parentDir = activeRepo.substring(0, activeRepo.lastIndexOf('/'));
      setPath(`${parentDir}/${repoName}-${safeBranch}`);
    }
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
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.15 }}
                  className="w-full max-w-2xl bg-surface-3 border border-white/10 rounded-xl shadow-2xl"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <Dialog.Title className="text-base font-medium text-white/90 flex items-center gap-2">
                      <Plus className="w-4 h-4 text-indigo-400" />
                      Create New Worktree
                    </Dialog.Title>
                    <Dialog.Close asChild>
                      <button className="text-white/30 hover:text-white/60 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </Dialog.Close>
                  </div>

                  <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-5">
                    {/* Template Selector */}
                    {templates.length > 0 && (
                      <div className="flex items-center gap-2">
                        <FileStack className="w-3.5 h-3.5 text-white/30" />
                        <span className="text-xs text-white/40">Template:</span>
                        {templates.map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => applyTemplate(t)}
                            className="px-2 py-1 text-[11px] bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/80 rounded-md transition-colors"
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Mode Toggle */}
                    <div className="flex items-center bg-white/5 rounded-lg p-0.5 self-start">
                      <button
                        type="button"
                        onClick={() => { setMode('existing'); setBranch(''); setPathManuallyEdited(false); }}
                        className={cn(
                          'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                          mode === 'existing'
                            ? 'bg-white/10 text-white/80'
                            : 'text-white/40 hover:text-white/60'
                        )}
                      >
                        From existing branch
                      </button>
                      <button
                        type="button"
                        onClick={() => { setMode('new'); setBranch(''); setPathManuallyEdited(false); }}
                        className={cn(
                          'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                          mode === 'new'
                            ? 'bg-white/10 text-white/80'
                            : 'text-white/40 hover:text-white/60'
                        )}
                      >
                        Create new branch
                      </button>
                    </div>

                    {/* Branch Selection */}
                    {mode === 'existing' ? (
                      <div className="flex flex-col gap-2">
                        <label className="text-white/50 text-xs font-medium">Select branch</label>
                        {availableBranches.length === 0 ? (
                          <div className="bg-white/[0.02] border border-white/5 rounded-lg px-4 py-3">
                            <p className="text-xs text-white/30 italic">
                              All local branches already have worktrees. Switch to "Create new branch" to add one.
                            </p>
                          </div>
                        ) : (
                          <>
                            {availableBranches.length > 5 && (
                              <Input
                                value={branchFilter}
                                onChange={e => setBranchFilter(e.target.value)}
                                placeholder="Filter branches..."
                                icon={<Search className="w-3.5 h-3.5" />}
                                className="text-xs"
                              />
                            )}
                            <div className="max-h-40 overflow-y-auto rounded-lg border border-white/5 bg-white/[0.02]">
                              {filteredBranches.map(name => (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={() => selectBranch(name)}
                                  className={cn(
                                    'w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors',
                                    branch === name
                                      ? 'bg-indigo-500/15 text-indigo-400'
                                      : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                                  )}
                                >
                                  <GitBranch className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{name}</span>
                                </button>
                              ))}
                              {filteredBranches.length === 0 && (
                                <p className="text-xs text-white/20 italic px-3 py-2">No branches match filter</p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-white/50 text-xs font-medium">New branch name</label>
                        <Input
                          value={branch}
                          onChange={e => { setBranch(e.target.value); setPathManuallyEdited(false); }}
                          placeholder="feature/new-ui"
                          icon={<GitBranch className="w-3.5 h-3.5" />}
                          required
                          autoFocus
                        />
                        <p className="text-[11px] text-white/25">Will be created from the current HEAD of the base repo.</p>
                      </div>
                    )}

                    {/* Path */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-white/50 text-xs font-medium">Worktree path</label>
                      <Input
                        value={path}
                        onChange={e => { setPath(e.target.value); setPathManuallyEdited(true); }}
                        placeholder="/Users/gaston/code/my-feature"
                        icon={<FolderOpen className="w-3.5 h-3.5" />}
                        required
                      />
                      {!pathManuallyEdited && branch && (
                        <p className="text-[11px] text-white/25">Auto-generated from branch name. Edit to customize.</p>
                      )}
                    </div>

                    {/* Options (General) */}
                    <div className="flex flex-col gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-lg mt-1">
                      <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded self-start">Environment Settings</h4>

                      <div className="flex flex-col gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={copyConfigs}
                            onChange={e => setCopyConfigs(e.target.checked)}
                            className="accent-indigo-500 rounded border-white/10"
                          />
                          <span className="text-white/80 text-sm">Copy Caches (e.g. node_modules, target)</span>
                        </label>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-white/50 text-xs font-medium">Post-Create Command (Optional)</label>
                          <Input
                            value={postCreateCommand}
                            onChange={e => setPostCreateCommand(e.target.value)}
                            placeholder="npm install && npm run build"
                            className="text-xs py-1.5"
                          />
                          <p className="text-[10px] text-white/30">Executes immediately after worktree creation.</p>
                        </div>
                      </div>
                    </div>

                    {/* Options (Laravel Specific) */}
                    {framework.is_laravel && (
                      <div className="flex flex-col gap-4 p-4 bg-indigo-500/5 shadow-inner border border-indigo-500/10 rounded-lg mt-1">
                        <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded self-start">Laravel & Herd Hub</h4>

                        <div className="grid grid-cols-2 gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={herdLink}
                              onChange={e => setHerdLink(e.target.checked)}
                              className="accent-indigo-500 rounded border-white/10"
                            />
                            <span className="text-white/80 text-sm flex items-center gap-1.5">
                              <Link className="w-3.5 h-3.5" /> Link to Laravel Herd
                            </span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={assignVitePort}
                              onChange={e => setAssignVitePort(e.target.checked)}
                              className="accent-indigo-500 rounded border-white/10"
                            />
                            <span className="text-white/80 text-sm">Assign isolated VITE_PORT</span>
                          </label>
                        </div>

                        <div className="flex flex-col gap-2 pt-3 border-t border-indigo-500/10">
                          <span className="text-white/50 text-xs font-medium">Database Connection</span>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="dbStrategy"
                                value="shared"
                                checked={dbStrategy === 'shared'}
                                onChange={() => setDbStrategy('shared')}
                                className="accent-indigo-500"
                              />
                              <span className="text-white/80 text-sm">Use source DB</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="dbStrategy"
                                value="isolated"
                                checked={dbStrategy === 'isolated'}
                                onChange={() => setDbStrategy('isolated')}
                                className="accent-indigo-500"
                              />
                              <span className="text-white/80 text-sm">Create isolated DB (New)</span>
                            </label>
                            {/* Cloned DB (Replica) */}
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="dbStrategy"
                                value="cloned"
                                checked={dbStrategy === 'cloned'}
                                onChange={() => setDbStrategy('cloned')}
                                className="accent-indigo-500"
                              />
                              <span className="text-white/80 text-sm">Clone DB Data (Replica)</span>
                            </label>
                          </div>

                          {(dbStrategy === 'isolated' || dbStrategy === 'cloned') && (
                            <div className="mt-2.5 flex flex-col gap-1.5 pl-5 border-l-2 border-indigo-500/20 ml-1">
                              <label className="text-indigo-400/70 text-xs font-medium">New Database Name</label>
                              <Input
                                value={dbName}
                                onChange={e => setDbName(e.target.value)}
                                placeholder="new_database_name"
                                className="text-sm bg-[#050505]/50 border-indigo-500/20 focus:border-indigo-500/50"
                              />
                              <p className="text-[10px] text-white/30">
                                {dbStrategy === 'cloned'
                                  ? 'Rust will duplicate the schema AND data from the source database.'
                                  : 'Rust will automatically create and migrate this empty database for you.'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Preview */}
                    {path && branch && (
                      <div className="bg-white/[0.02] border border-white/5 rounded-lg px-4 py-3">
                        <p className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Summary</p>
                        <div className="space-y-1 text-xs">
                          <div className="flex gap-2">
                            <span className="text-white/30 w-14 shrink-0">Branch:</span>
                            <span className="text-indigo-400 font-mono break-all">{branch}</span>
                            <span className="text-white/20">({mode === 'new' ? 'new' : 'existing'})</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-white/30 w-14 shrink-0">Path:</span>
                            <span className="text-white/60 font-mono break-all">{path}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
                      <Dialog.Close asChild>
                        <Button variant="ghost" size="sm" type="button">Cancel</Button>
                      </Dialog.Close>
                      <Button variant="primary" size="sm" type="submit" disabled={loading || !branch || !path}>
                        {loading ? 'Creating...' : 'Create Worktree'}
                      </Button>
                    </div>
                  </form>
                </motion.div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
