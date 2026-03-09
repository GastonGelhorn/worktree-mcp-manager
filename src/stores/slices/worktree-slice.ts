import type { StateCreator } from 'zustand';
import type { AppState } from '../app-store';
import type { Worktree, Branch, FrameworkInfo, WorktreeEnriched } from '../../types';
import * as cmd from '../../lib/tauri-commands';
import { withRetry } from '../../lib/retry';
import { parseGitError } from '../../lib/git-errors';

export interface WorktreeSlice {
  worktrees: WorktreeEnriched[];
  branches: Branch[];
  framework: FrameworkInfo;
  loading: boolean;
  error: string | null;
  focusedWorktreePath: string | null;

  loadData: () => Promise<void>;
  setFocusedWorktreePath: (path: string | null) => void;
  enrichWorktrees: (worktrees: Worktree[]) => Promise<WorktreeEnriched[]>;
  addWorktree: (path: string, branch: string, createBranch: boolean, herdLink: boolean, newDbName: string | null, assignVitePort: boolean, copyConfigs: boolean, cloneDb: boolean) => Promise<void>;
  removeWorktree: (path: string) => Promise<void>;
  mergeAndCleanup: (path: string, branchToMerge: string, targetBranch: string) => Promise<void>;
}

export const createWorktreeSlice: StateCreator<AppState, [], [], WorktreeSlice> = (set, get) => ({
  worktrees: [],
  branches: [],
  framework: { is_laravel: false, has_composer: false },
  loading: false,
  error: null,
  focusedWorktreePath: null,

  setFocusedWorktreePath: (path) => set({ focusedWorktreePath: path }),

  enrichWorktrees: async (worktrees: Worktree[]): Promise<WorktreeEnriched[]> => {
    const enriched: WorktreeEnriched[] = [];
    for (const wt of worktrees) {
      let status: string | undefined;
      let lastCommit: WorktreeEnriched['lastCommit'] | undefined;
      let aheadBehind: WorktreeEnriched['aheadBehind'] | undefined;
      try {
        status = await cmd.getChanges(wt.path);
      } catch { }
      try {
        lastCommit = await cmd.getLastCommit(wt.path);
      } catch { }
      try {
        const branch = wt.branch?.replace('refs/heads/', '');
        if (branch) {
          aheadBehind = await cmd.getAheadBehind(wt.path, branch);
        }
      } catch { }
      enriched.push({ ...wt, status, lastCommit, aheadBehind });
    }
    return enriched;
  },

  loadData: async () => {
    const { activeRepo, enrichWorktrees } = get();
    if (!activeRepo) {
      set({ worktrees: [], branches: [], focusedWorktreePath: null });
      return;
    }

    set({ loading: true, error: null });
    try {
      const [wts, brs, fw] = await withRetry(() => Promise.all([
        cmd.listWorktrees(activeRepo),
        cmd.listBranches(activeRepo),
        cmd.checkFramework(activeRepo),
      ]), { maxRetries: 2, baseDelay: 300 });

      let enriched: WorktreeEnriched[];
      try {
        enriched = await enrichWorktrees(wts);
      } catch {
        enriched = wts.map(wt => ({ ...wt }));
      }
      if (enriched.length > 0) {
        enriched[0]!.isMain = true;
      }

      const paths = enriched.map(w => w.path);
      const currentFocused = get().focusedWorktreePath;
      const nextFocused =
        currentFocused && paths.includes(currentFocused)
          ? currentFocused
          : (enriched.find(w => w.isMain) ?? enriched[0])?.path ?? null;

      set({ worktrees: enriched, branches: brs, framework: fw, focusedWorktreePath: nextFocused });
    } catch (e: unknown) {
      set({ error: parseGitError(String(e)), worktrees: [], branches: [], focusedWorktreePath: null });
    } finally {
      set({ loading: false });
    }
  },

  addWorktree: async (path: string, branch: string, createBranch: boolean, herdLink: boolean, newDbName: string | null, assignVitePort: boolean, copyConfigs: boolean, cloneDb: boolean) => {
    const { activeRepo, framework, loadData, addToast } = get();
    set({ loading: true, error: null });
    try {
      await cmd.addWorktree(activeRepo, path, branch, createBranch, newDbName, assignVitePort, copyConfigs, cloneDb);
      if (herdLink && framework.is_laravel) {
        const projectName = path.split('/').pop() || 'new-project';
        await cmd.herdLink(path, projectName);
      }
      const postCreate = get().postCreateWorktreeCommand?.trim();
      if (postCreate) {
        try {
          await cmd.startProcess(path, postCreate);
        } catch (e: unknown) {
          addToast('warning', 'Post-create command failed', e instanceof Error ? e.message : String(e));
        }
      }
      await loadData();
      addToast('success', 'Worktree created', `Created worktree at ${path}`);
    } catch (e: unknown) {
      set({ error: String(e) });
      addToast('error', 'Failed to create worktree', String(e));
    } finally {
      set({ loading: false });
    }
  },

  removeWorktree: async (path: string) => {
    const { activeRepo, loadData, addToast } = get();
    set({ loading: true, error: null });
    try {
      await cmd.removeWorktree(activeRepo, path);
      await loadData();
      addToast('success', 'Worktree removed', `Removed ${path.split('/').pop()}`);
    } catch (e: unknown) {
      set({ error: String(e) });
      addToast('error', 'Failed to remove worktree', String(e));
      set({ loading: false });
    }
  },

  mergeAndCleanup: async (path: string, branchToMerge: string, targetBranch: string) => {
    const { activeRepo, loadData, addToast } = get();
    set({ loading: true, error: null });
    try {
      await cmd.mergeAndCleanup(activeRepo, path, targetBranch, branchToMerge);
      await loadData();
      addToast('success', 'Merge and Cleanup successful', `Merged ${branchToMerge} into ${targetBranch}`);
    } catch (e: unknown) {
      set({ error: String(e) });
      addToast('error', 'Merge failed', String(e));
      set({ loading: false });
    }
  },
});
