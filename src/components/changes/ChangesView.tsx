import { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { WorktreeExpandableFiles } from '../worktree/WorktreeExpandableFiles';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { RefreshCw, Download, Upload, GitFork, GitPullRequest, GitMerge } from 'lucide-react';
import * as cmd from '../../lib/tauri-commands';
import { basename } from '../../lib/utils';

export function ChangesView() {
  const activeRepo = useAppStore(s => s.activeRepo);
  const worktrees = useAppStore(s => s.worktrees);
  const focusedWorktreePath = useAppStore(s => s.focusedWorktreePath);
  const loadData = useAppStore(s => s.loadData);
  const addToast = useAppStore(s => s.addToast);
  const loading = useAppStore(s => s.loading);
  const [pullLoading, setPullLoading] = useState(false);
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [prLoading, setPrLoading] = useState(false);

  const focusedWorktree = focusedWorktreePath
    ? worktrees.find(w => w.path === focusedWorktreePath)
    : null;

  const handlePull = async () => {
    if (!focusedWorktreePath) return;
    setPullLoading(true);
    try {
      await cmd.pull(focusedWorktreePath);
      addToast('success', 'Pulled');
      loadData();
    } catch (e: unknown) {
      addToast('error', 'Pull failed', e instanceof Error ? e.message : String(e));
    } finally {
      setPullLoading(false);
    }
  };

  const handlePush = async () => {
    if (!focusedWorktreePath) return;
    setPushLoading(true);
    try {
      await cmd.push(focusedWorktreePath);
      addToast('success', 'Pushed');
      loadData();
    } catch (e: unknown) {
      addToast('error', 'Push failed', e instanceof Error ? e.message : String(e));
    } finally {
      setPushLoading(false);
    }
  };

  const handleFetch = async () => {
    if (!activeRepo) return;
    setFetchLoading(true);
    try {
      await cmd.fetch(activeRepo);
      addToast('success', 'Fetched');
      loadData();
    } catch (e: unknown) {
      addToast('error', 'Fetch failed', e instanceof Error ? e.message : String(e));
    } finally {
      setFetchLoading(false);
    }
  };

  const handleOpenPr = async () => {
    if (!activeRepo || !focusedWorktree?.branch) return;
    const branch = focusedWorktree.branch.replace('refs/heads/', '');
    if (!branch) return;
    setPrLoading(true);
    try {
      const url = await cmd.generatePrUrl(activeRepo, branch);
      window.open(url, '_blank');
      addToast('success', 'Pull Request', 'Opened in browser');
    } catch (e: unknown) {
      addToast('error', 'Failed to open PR', e instanceof Error ? e.message : String(e));
    } finally {
      setPrLoading(false);
    }
  };

  const mainWorktree = worktrees.find(w => w.isMain);
  const currentBranch = focusedWorktree?.branch?.replace('refs/heads/', '') ?? '';
  const targetBranch = mainWorktree?.branch?.replace('refs/heads/', '') ?? 'main';
  const canMergeIntoMain =
    mainWorktree &&
    focusedWorktreePath &&
    currentBranch &&
    targetBranch &&
    currentBranch !== targetBranch &&
    mainWorktree.path !== focusedWorktreePath;

  const handleMergeIntoMain = async () => {
    if (!mainWorktree || !currentBranch || !targetBranch) return;
    setMergeConfirmOpen(false);
    try {
      await cmd.mergeBranchInto(mainWorktree.path, targetBranch, currentBranch);
      addToast('success', 'Merged', `${currentBranch} merged into ${targetBranch}`);
      await loadData();
    } catch (e: unknown) {
      addToast('error', 'Merge failed', e instanceof Error ? e.message : String(e));
    }
  };

  if (!activeRepo) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <GitFork className="w-12 h-12 text-white/10 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-white/30 mb-2">No repository selected</h2>
          <p className="text-sm text-white/20">Add or select a repository from the sidebar to view changes.</p>
        </div>
      </div>
    );
  }

  if (!focusedWorktreePath || worktrees.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <GitFork className="w-12 h-12 text-white/10 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-white/30 mb-2">No worktree selected</h2>
          <p className="text-sm text-white/20">Select a worktree from the sidebar to view and commit changes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-surface-2/50 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => loadData()}
          disabled={loading}
          title="Refresh"
        >
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span className="text-xs ml-1">Refresh</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePull}
          disabled={pullLoading}
          title="Pull"
        >
          {pullLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          <span className="text-xs ml-1">Pull</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePush}
          disabled={pushLoading}
          title="Push"
        >
          {pushLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          <span className="text-xs ml-1">Push</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleFetch}
          disabled={fetchLoading || !activeRepo}
          title="Fetch"
        >
          {fetchLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          <span className="text-xs ml-1">Fetch</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOpenPr}
          disabled={prLoading || !focusedWorktree?.branch}
          title="Open Pull Request"
        >
          {prLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <GitPullRequest className="w-3.5 h-3.5" />}
          <span className="text-xs ml-1">Pull Request</span>
        </Button>
        {canMergeIntoMain && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMergeConfirmOpen(true)}
            title={`Merge ${currentBranch} into ${targetBranch}`}
          >
            <GitMerge className="w-3.5 h-3.5" />
            <span className="text-xs ml-1">Merge into {targetBranch}</span>
          </Button>
        )}
        <span className="text-xs text-white/30 ml-2 truncate" title={focusedWorktreePath}>
          {basename(focusedWorktreePath)}
          {focusedWorktree?.branch && (
            <span className="text-white/20"> ({focusedWorktree.branch.replace('refs/heads/', '')})</span>
          )}
        </span>
      </div>

      <ConfirmDialog
        open={mergeConfirmOpen}
        onOpenChange={setMergeConfirmOpen}
        title={`Merge into ${targetBranch}`}
        description={`Merge branch "${currentBranch}" into ${targetBranch}. You can remove this worktree from the list afterwards.`}
        confirmLabel="Merge"
        variant="default"
        onConfirm={handleMergeIntoMain}
      />

      {/* Content: files + diff + commit — fills remaining height */}
      <div className="flex-1 min-h-0 flex flex-col px-4">
        <WorktreeExpandableFiles
          wtPath={focusedWorktreePath}
          status={focusedWorktree?.status ?? ''}
          onRefresh={loadData}
          className="flex-1 min-h-0"
        />
      </div>
    </div>
  );
}
