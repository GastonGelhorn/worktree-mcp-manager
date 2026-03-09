import { useMemo } from 'react';
import { useAppStore } from '../../stores/app-store';
import { StatCard } from './StatCard';
import { ConflictRadar } from './ConflictRadar';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { WorktreeStatusBadge } from '../worktree/WorktreeStatusBadge';
import { Button } from '../ui/Button';
import { GitFork, GitBranch, AlertCircle, GitCompare, ArrowRight, Plus, RefreshCw, ArrowUp, ArrowDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { basename } from '../../lib/utils';

export function Dashboard() {
  const worktrees = useAppStore(s => s.worktrees);
  const branches = useAppStore(s => s.branches);
  const loadData = useAppStore(s => s.loadData);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const setCommandPaletteOpen = useAppStore(s => s.setCommandPaletteOpen);

  const stats = useMemo(() => {
    const localBranches = branches.filter(b => !b.is_remote);
    const branchesWithWT = new Set(
      worktrees.map(w => w.branch?.replace('refs/heads/', '')).filter(Boolean)
    );
    const branchesWithout = localBranches.filter(b => !branchesWithWT.has(b.name));
    const dirtyWorktrees = worktrees.filter(w => w.status && w.status.trim() !== '');

    return {
      totalWorktrees: worktrees.length,
      totalBranches: localBranches.length,
      branchesWithoutWT: branchesWithout.length,
      dirtyWorktrees: dirtyWorktrees.length,
    };
  }, [worktrees, branches]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white/90 tracking-tight">Dashboard</h2>
          <p className="text-xs text-white/30 mt-1">Overview of your repository workspace.</p>
        </div>
        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => loadData()} title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCommandPaletteOpen(true)} title="New Worktree">
            <Plus className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setActiveTab('graph')} title="Open Graph">
            <GitCompare className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <StatCard
            label="Active Worktrees"
            value={stats.totalWorktrees}
            icon={<GitFork className="w-4 h-4" />}
            color="indigo"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <StatCard
            label="Local Branches"
            value={stats.totalBranches}
            icon={<GitBranch className="w-4 h-4" />}
            color="sky"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <StatCard
            label="Uncommitted Changes"
            value={stats.dirtyWorktrees}
            icon={<AlertCircle className="w-4 h-4" />}
            color={stats.dirtyWorktrees > 0 ? 'amber' : 'emerald'}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <StatCard
            label="Branches w/o Worktree"
            value={stats.branchesWithoutWT}
            icon={<GitBranch className="w-4 h-4" />}
            color="purple"
          />
        </motion.div>
      </div>

      {/* Worktrees Quick View */}
      {worktrees.length > 0 && (
        <Card className="p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white/70">Active Worktrees</h3>
            <button
              onClick={() => setActiveTab('worktrees')}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {worktrees.slice(0, 5).map(wt => (
              <div key={wt.path} className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm text-white/80 font-medium truncate">{basename(wt.path)}</span>
                  <Badge variant="default">
                    {wt.branch?.replace('refs/heads/', '') || 'detached'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {wt.aheadBehind && (wt.aheadBehind.ahead > 0 || wt.aheadBehind.behind > 0) && (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      {wt.aheadBehind.ahead > 0 && (
                        <span className="flex items-center gap-0.5 text-green-400" title={`${wt.aheadBehind.ahead} ahead of origin`}>
                          <ArrowUp className="w-3 h-3" />{wt.aheadBehind.ahead}
                        </span>
                      )}
                      {wt.aheadBehind.behind > 0 && (
                        <span className="flex items-center gap-0.5 text-orange-400" title={`${wt.aheadBehind.behind} behind origin`}>
                          <ArrowDown className="w-3 h-3" />{wt.aheadBehind.behind}
                        </span>
                      )}
                    </div>
                  )}
                  <WorktreeStatusBadge status={wt.status} isDetached={wt.is_detached} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Conflict Radar */}
      {worktrees.length > 0 && (
        <Card className="p-4">
          <ConflictRadar
            branches={worktrees
              .filter(wt => wt.branch)
              .map(wt => ({
                name: wt.branch?.replace('refs/heads/', '') || 'detached',
                ahead: wt.aheadBehind?.ahead || 0,
                behind: wt.aheadBehind?.behind || 0,
                hasConflicts: false,
              }))}
          />
        </Card>
      )}
    </div>
  );
}
