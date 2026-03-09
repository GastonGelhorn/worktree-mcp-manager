import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/app-store';
import { WorktreeCard } from './WorktreeCard';
import { CreateWorktreeDialog } from './CreateWorktreeDialog';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import { Badge } from '../ui/Badge';
import { Plus, LayoutGrid, List, Table2, GitFork, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { WorktreeStatusBadge } from './WorktreeStatusBadge';
import { CiStatusBadge } from './CiStatusBadge';
import { WorktreeActions } from './WorktreeActions';
import type { ViewMode } from '../../types';
import type { WorktreeState, CiStatus } from '../../types/new-types';
import * as cmd from '../../lib/tauri-commands-new';

export function WorktreeGrid() {
  const worktrees = useAppStore(s => s.worktrees);
  const loading = useAppStore(s => s.loading);
  const error = useAppStore(s => s.error);
  const viewMode = useAppStore(s => s.viewMode);
  const setViewMode = useAppStore(s => s.setViewMode);
  const framework = useAppStore(s => s.framework);
  const loadData = useAppStore(s => s.loadData);

  const [createOpen, setCreateOpen] = useState(false);

  const viewIcons: { mode: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
    { mode: 'grid', icon: LayoutGrid, label: 'Grid' },
    { mode: 'list', icon: List, label: 'List' },
    { mode: 'table', icon: Table2, label: 'Table' },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-white/90 tracking-tight">Worktrees</h2>
            <Badge variant="default">{worktrees.length}</Badge>
            {framework.is_laravel && <Badge variant="laravel">Laravel</Badge>}
          </div>
          <p className="text-xs text-white/30 mt-1">
            Manage isolated environments for your repository.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center bg-white/5 rounded-lg p-0.5">
            {viewIcons.map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={label}
                className={cn(
                  'p-1.5 rounded-md transition-all',
                  viewMode === mode
                    ? 'bg-white/10 text-white/80'
                    : 'text-white/30 hover:text-white/50'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          <Button variant="ghost" size="sm" onClick={loadData} title="Refresh">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>

          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            New Worktree
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && worktrees.length === 0 ? (
        <div className="flex items-center gap-2 text-white/40 py-12 justify-center">
          <LoadingSpinner />
          <span className="text-sm">Loading worktrees...</span>
        </div>
      ) : worktrees.length === 0 ? (
        <EmptyState
          icon={<GitFork className="w-12 h-12" />}
          title="No worktrees yet"
          description="Create your first worktree to start working with isolated environments."
          action={
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> Create Worktree
            </Button>
          }
        />
      ) : (
        <>
          {/* Grid View */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {worktrees.map((wt, i) => (
                <WorktreeCard key={wt.path} worktree={wt} index={i} />
              ))}
            </div>
          )}

          {/* List View */}
          {viewMode === 'list' && (
            <div className="flex flex-col gap-1.5">
              {worktrees.map((wt, i) => (
                <WorktreeCard key={wt.path} worktree={wt} index={i} />
              ))}
            </div>
          )}

          {/* Table View */}
          {viewMode === 'table' && (
            <EnhancedTableView worktrees={worktrees} />
          )}
        </>
      )}

      <CreateWorktreeDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

// ── Enhanced Table View Component ──────────────────────────────────────

interface EnhancedTableViewProps {
  worktrees: any[];
}

function EnhancedTableView({ worktrees }: EnhancedTableViewProps) {
  const activeRepo = useAppStore(s => s.activeRepo);
  const setFocusedWorktreePath = useAppStore(s => s.setFocusedWorktreePath);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const [rowData, setRowData] = useState<Record<string, {
    ciStatus: CiStatus;
    wtState: WorktreeState | null;
    loading: boolean;
  }>>({});

  // Load CI and state data for all worktrees
  useEffect(() => {
    const loadAllData = async () => {
      const data: typeof rowData = {};

      for (const wt of worktrees) {
        try {
          data[wt.path] = { ciStatus: 'None', wtState: null, loading: true };

          const branchName = wt.branch?.replace('refs/heads/', '') || 'detached';
          const ciResult = await cmd.getCiStatus(activeRepo, branchName);
          const wtState = await cmd.getWorktreeState(wt.path);

          data[wt.path] = {
            ciStatus: ciResult.ci_status,
            wtState,
            loading: false,
          };
        } catch (e) {
          data[wt.path] = { ciStatus: 'None', wtState: null, loading: false };
        }
      }

      setRowData(data);
    };

    if (activeRepo && worktrees.length > 0) {
      loadAllData();
    }
  }, [worktrees, activeRepo]);

  const handleRowClick = (wtPath: string) => {
    setFocusedWorktreePath(wtPath);
    setActiveTab('changes');
  };

  // Check if any worktree actually has CI configured
  const hasCi = Object.values(rowData).some(d => d.ciStatus !== 'None');

  return (
    <div className="border border-white/[0.06] rounded-xl overflow-x-auto">
      <table className="w-full text-xs table-fixed">
        <colgroup>
          <col className="w-[20%] min-w-[100px]" />
          <col className="w-[16%] min-w-[90px]" />
          <col className="w-[12%] min-w-[70px]" />
          {hasCi && <col className="w-[10%] min-w-[70px]" />}
          <col className="w-[12%] min-w-[70px]" />
          <col className="w-auto" />
          <col className="w-[48px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-white/5 bg-white/[0.02]">
            <th className="text-left px-3 py-2.5 text-white/40 font-medium uppercase tracking-wider text-[10px]">Name</th>
            <th className="text-left px-3 py-2.5 text-white/40 font-medium uppercase tracking-wider text-[10px]">Branch</th>
            <th className="text-left px-3 py-2.5 text-white/40 font-medium uppercase tracking-wider text-[10px]">Status</th>
            {hasCi && <th className="text-left px-3 py-2.5 text-white/40 font-medium uppercase tracking-wider text-[10px]">CI</th>}
            <th className="text-left px-3 py-2.5 text-white/40 font-medium uppercase tracking-wider text-[10px]">Changes</th>
            <th className="text-left px-3 py-2.5 text-white/40 font-medium uppercase tracking-wider text-[10px]">Path</th>
            <th className="px-2 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {worktrees.map(wt => {
            const branchName = wt.branch?.replace('refs/heads/', '') || 'detached';
            const dirName = wt.path.split('/').pop() || wt.path;
            const data = rowData[wt.path];

            return (
              <tr
                key={wt.path}
                onClick={() => handleRowClick(wt.path)}
                className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer group"
              >
                {/* Name */}
                <td className="px-3 py-2.5 truncate text-white/80 font-medium" title={dirName}>
                  {dirName}
                </td>

                {/* Branch */}
                <td className="px-3 py-2.5 truncate">
                  <span className="inline-block max-w-full truncate">
                    <Badge variant="default" className="max-w-full truncate">{branchName}</Badge>
                  </span>
                </td>

                {/* Status */}
                <td className="px-3 py-2.5">
                  <WorktreeStatusBadge status={wt.status} isDetached={wt.is_detached} />
                </td>

                {/* CI Status — only if any worktree has CI */}
                {hasCi && (
                  <td className="px-3 py-2.5">
                    {!data ? (
                      <Loader2 className="w-3 h-3 animate-spin text-white/40" />
                    ) : (
                      <CiStatusBadge status={data.ciStatus} />
                    )}
                  </td>
                )}

                {/* Changes */}
                <td className="px-3 py-2.5">
                  {!data || data.loading ? (
                    <span className="text-white/20">—</span>
                  ) : data.wtState ? (
                    <div className="flex items-center gap-1 flex-wrap">
                      {data.wtState.staged_count > 0 && (
                        <span className="bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded text-[10px]" title="Staged">
                          +{data.wtState.staged_count}
                        </span>
                      )}
                      {data.wtState.modified_count > 0 && (
                        <span className="bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded text-[10px]" title="Modified">
                          ~{data.wtState.modified_count}
                        </span>
                      )}
                      {data.wtState.untracked_count > 0 && (
                        <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-[10px]" title="Untracked">
                          ?{data.wtState.untracked_count}
                        </span>
                      )}
                      {!data.wtState.staged_count && !data.wtState.modified_count && !data.wtState.untracked_count && (
                        <span className="text-emerald-400/60 text-[10px]">clean</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-white/20">—</span>
                  )}
                </td>

                {/* Path */}
                <td className="px-3 py-2.5 truncate text-white/30 font-mono text-[10px]" title={wt.path}>
                  {wt.path}
                </td>

                {/* Actions */}
                <td className="px-2 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                  <WorktreeActions
                    worktree={wt}
                    onRequestDelete={wt.isMain ? undefined : undefined}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
