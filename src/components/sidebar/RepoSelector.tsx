import { useState, useMemo } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../../stores/app-store';
import { Input } from '../ui/Input';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import * as cmd from '../../lib/tauri-commands';
import { FolderGit2, X, Plus, ChevronDown, FolderSearch, Loader2, Search } from 'lucide-react';
import { basename, cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export function RepoSelector() {
  const repoPaths = useAppStore(s => s.repoPaths);
  const activeRepo = useAppStore(s => s.activeRepo);
  const addRepository = useAppStore(s => s.addRepository);
  const addMultipleRepos = useAppStore(s => s.addMultipleRepos);
  const removeRepository = useAppStore(s => s.removeRepository);
  const setActiveRepo = useAppStore(s => s.setActiveRepo);
  const addToast = useAppStore(s => s.addToast);

  const [showManualInput, setShowManualInput] = useState(false);
  const [newRepoInput, setNewRepoInput] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [confirmRemoveRepo, setConfirmRemoveRepo] = useState<string | null>(null);
  const [repoSearch, setRepoSearch] = useState('');

  const filteredRepos = useMemo(() => {
    if (!repoSearch) return repoPaths;
    const q = repoSearch.toLowerCase();
    return repoPaths.filter(p => basename(p).toLowerCase().includes(q) || p.toLowerCase().includes(q));
  }, [repoPaths, repoSearch]);

  const handleManualAdd = () => {
    if (newRepoInput.trim()) {
      addRepository(newRepoInput.trim());
      setNewRepoInput('');
      setShowManualInput(false);
    }
  };

  const handleBrowse = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Select a repository or folder containing repositories',
      });

      if (!selected) return;

      const dirPath = typeof selected === 'string' ? selected : selected;
      setScanning(true);

      try {
        const repos = await cmd.scanRepos(dirPath);

        if (repos.length === 0) {
          addToast('warning', 'No Git repos found', `No repositories detected in ${dirPath.split('/').pop()}`);
        } else if (repos.length === 1) {
          addRepository(repos[0]);
        } else {
          addMultipleRepos(repos);
        }
      } catch {
        addRepository(dirPath);
      }
    } catch (e: any) {
      addToast('error', 'Browse failed', e.toString());
    } finally {
      setScanning(false);
    }
  };

  const showSearch = repoPaths.length > 3;

  return (
    <>
      <div className="border-b border-white/5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.02] transition-colors"
        >
          <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">
            Repositories
            {repoPaths.length > 0 && (
              <span className="text-white/20 ml-1.5">{repoPaths.length}</span>
            )}
          </span>
          <div className="flex items-center gap-1">
            <span
              onClick={(e) => { e.stopPropagation(); handleBrowse(); }}
              className="p-0.5 rounded hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors"
              title="Browse for repositories"
            >
              {scanning ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
            </span>
            <ChevronDown className={cn('w-3 h-3 text-white/30 transition-transform', !expanded && '-rotate-90')} />
          </div>
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="px-2 pb-2 flex flex-col gap-0.5">
                {/* Search repos */}
                {showSearch && (
                  <div className="mb-1">
                    <Input
                      value={repoSearch}
                      onChange={e => setRepoSearch(e.target.value)}
                      placeholder="Filter repos..."
                      icon={<Search className="w-3.5 h-3.5" />}
                      className="text-xs py-1.5"
                    />
                  </div>
                )}

                <div className="max-h-[40vh] overflow-y-auto flex flex-col gap-0.5">
                {filteredRepos.map(p => (
                  <div
                    key={p}
                    onClick={() => setActiveRepo(p)}
                    className={cn(
                      'group flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-all duration-150',
                      activeRepo === p
                        ? 'bg-indigo-500/10 text-indigo-400'
                        : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                    )}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FolderGit2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate text-xs font-medium" title={p}>{basename(p)}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmRemoveRepo(p); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 text-white/40 hover:text-red-400 transition-all"
                      title="Remove repository"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {repoPaths.length > 0 && filteredRepos.length === 0 && repoSearch && (
                  <div className="text-white/20 text-xs italic px-3 py-2">
                    No repos match "{repoSearch}"
                  </div>
                )}
                </div>

                {repoPaths.length === 0 && (
                  <div className="text-center py-4 px-2">
                    <FolderSearch className="w-6 h-6 text-white/10 mx-auto mb-2" />
                    <p className="text-white/20 text-xs mb-2">No repositories yet</p>
                    <button
                      onClick={handleBrowse}
                      disabled={scanning}
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 mx-auto"
                    >
                      {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Browse for folder
                    </button>
                  </div>
                )}

                {repoPaths.length > 0 && (
                  <button
                    onClick={() => setShowManualInput(!showManualInput)}
                    className="text-[10px] text-white/20 hover:text-white/40 transition-colors px-2 py-1 flex items-center gap-1"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    Enter path manually
                  </button>
                )}

                <AnimatePresence>
                  {showManualInput && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mt-1"
                    >
                      <div className="flex gap-1.5">
                        <Input
                          value={newRepoInput}
                          onChange={e => setNewRepoInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleManualAdd()}
                          placeholder="/path/to/repo"
                          className="text-xs py-1.5"
                          autoFocus
                        />
                        <button
                          onClick={handleManualAdd}
                          className="px-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 transition-colors shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Confirm: Remove repository */}
      <ConfirmDialog
        open={confirmRemoveRepo !== null}
        onOpenChange={(open) => { if (!open) setConfirmRemoveRepo(null); }}
        title="Remove Repository"
        description={`Remove "${confirmRemoveRepo ? basename(confirmRemoveRepo) : ''}" from the list? This only removes it from the app — no files will be deleted.`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => {
          if (confirmRemoveRepo) removeRepository(confirmRemoveRepo);
          setConfirmRemoveRepo(null);
        }}
      />
    </>
  );
}
