import { useState, useMemo } from 'react';
import { useAppStore } from '../../stores/app-store';
import { BranchItem } from './BranchItem';
import { CheckoutDialog } from './CheckoutDialog';
import { CreateWorktreeDialog } from '../worktree/CreateWorktreeDialog';
import { Input } from '../ui/Input';
import { Search, ChevronDown } from 'lucide-react';
import { groupBranchesByPrefix, cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const PREFIXES_ORDER = ['feature', 'bugfix', 'hotfix', 'release', '_other'];
const PREFIX_LABELS: Record<string, string> = {
  feature: 'Features',
  bugfix: 'Bug Fixes',
  hotfix: 'Hotfixes',
  release: 'Releases',
  _other: 'Other',
};

interface BranchTreeProps {
  filter?: string;
}

export function BranchTree({ filter }: BranchTreeProps) {
  const branches = useAppStore(s => s.branches);
  const worktrees = useAppStore(s => s.worktrees);
  const branchSearch = useAppStore(s => s.branchSearch);
  const setBranchSearch = useAppStore(s => s.setBranchSearch);

  // Combine sidebar filter and branch search
  const combinedFilter = filter || branchSearch;

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [checkoutTarget, setCheckoutTarget] = useState<string | null>(null);
  const [createWtBranch, setCreateWtBranch] = useState<string | null>(null);

  const localBranches = useMemo(() => branches.filter(b => !b.is_remote), [branches]);
  const remoteBranches = useMemo(() => branches.filter(b => b.is_remote), [branches]);

  const filteredLocal = useMemo(() => {
    if (!combinedFilter) return localBranches;
    const q = combinedFilter.toLowerCase();
    return localBranches.filter(b => b.name.toLowerCase().includes(q));
  }, [localBranches, combinedFilter]);

  const grouped = useMemo(() => groupBranchesByPrefix(filteredLocal), [filteredLocal]);

  const branchesWithWorktrees = useMemo(() => {
    const set = new Set<string>();
    for (const wt of worktrees) {
      if (wt.branch) set.add(wt.branch.replace('refs/heads/', ''));
    }
    return set;
  }, [worktrees]);

  const toggleGroup = (prefix: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(prefix) ? next.delete(prefix) : next.add(prefix);
      return next;
    });
  };

  const sortedPrefixes = Object.keys(grouped).sort((a, b) => {
    const ai = PREFIXES_ORDER.indexOf(a);
    const bi = PREFIXES_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const [showRemote, setShowRemote] = useState(false);

  const handleBranchClick = (branchName: string) => {
    if (branchesWithWorktrees.has(branchName)) {
      // Branch already has a worktree — nothing to do (it's already visible)
      return;
    }
    // Branch without worktree — checkout in current folder
    setCheckoutTarget(branchName);
  };

  const handleCreateWorktree = (branchName: string) => {
    setCreateWtBranch(branchName);
  };

  return (
    <>
      <div className="flex-1 overflow-auto flex flex-col">
        {/* Search */}
        <div className="px-2 py-2">
          <Input
            value={branchSearch}
            onChange={e => setBranchSearch(e.target.value)}
            placeholder="Filter branches..."
            icon={<Search className="w-3.5 h-3.5" />}
            className="text-xs py-1.5"
          />
        </div>

        {/* Local Branches */}
        <div className="px-1 flex-1 overflow-auto">
          <div className="px-2 py-1">
            <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Local Branches</span>
          </div>

          {filteredLocal.length === 0 && (
            <div className="text-white/20 text-xs italic px-3 py-2">
              {combinedFilter ? 'No branches match filter' : 'No branches found'}
            </div>
          )}

          {sortedPrefixes.map(prefix => {
            const branchesInGroup = grouped[prefix];
            const isCollapsed = collapsedGroups.has(prefix);
            const hasMultiple = sortedPrefixes.length > 1 && branchesInGroup.length > 1;

            if (!hasMultiple) {
              return branchesInGroup.map(b => (
                <BranchItem
                  key={b.name}
                  branch={b}
                  hasWorktree={branchesWithWorktrees.has(b.name)}
                  onClick={() => handleBranchClick(b.name)}
                  onCreateWorktree={() => handleCreateWorktree(b.name)}
                />
              ));
            }

            return (
              <div key={prefix} className="mb-0.5">
                <button
                  onClick={() => toggleGroup(prefix)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider text-white/30 hover:text-white/50 transition-colors"
                >
                  <ChevronDown className={cn('w-3 h-3 transition-transform', isCollapsed && '-rotate-90')} />
                  <span>{PREFIX_LABELS[prefix] || prefix}</span>
                  <span className="text-white/20 ml-auto">{branchesInGroup.length}</span>
                </button>
                <AnimatePresence>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      {branchesInGroup.map(b => (
                        <BranchItem
                          key={b.name}
                          branch={b}
                          hasWorktree={branchesWithWorktrees.has(b.name)}
                          indent
                          onClick={() => handleBranchClick(b.name)}
                          onCreateWorktree={() => handleCreateWorktree(b.name)}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Remote Branches Toggle */}
        {remoteBranches.length > 0 && (
          <div className="border-t border-white/5">
            <button
              onClick={() => setShowRemote(!showRemote)}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-wider text-white/30 hover:text-white/50 transition-colors"
            >
              <ChevronDown className={cn('w-3 h-3 transition-transform', !showRemote && '-rotate-90')} />
              <span>Remote Branches</span>
              <span className="text-white/20 ml-auto">{remoteBranches.length}</span>
            </button>
            <AnimatePresence>
              {showRemote && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden max-h-48 overflow-y-auto px-1 pb-2"
                >
                  {remoteBranches.map(b => (
                    <BranchItem key={b.name} branch={b} hasWorktree={false} remote />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Checkout Dialog */}
      <CheckoutDialog
        open={checkoutTarget !== null}
        onOpenChange={(open) => { if (!open) setCheckoutTarget(null); }}
        targetBranch={checkoutTarget || ''}
      />

      {/* Create Worktree from branch */}
      <CreateWorktreeDialog
        open={createWtBranch !== null}
        onOpenChange={(open) => { if (!open) setCreateWtBranch(null); }}
        preselectedBranch={createWtBranch || undefined}
      />
    </>
  );
}
