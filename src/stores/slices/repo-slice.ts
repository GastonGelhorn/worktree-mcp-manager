import type { StateCreator } from 'zustand';
import type { AppState } from '../app-store';

export interface RepoSlice {
  repoPaths: string[];
  activeRepo: string;

  loadRepos: () => void;
  addRepository: (path: string) => void;
  addMultipleRepos: (paths: string[]) => void;
  removeRepository: (path: string) => void;
  setActiveRepo: (path: string) => void;
}

export const createRepoSlice: StateCreator<AppState, [], [], RepoSlice> = (set, get) => ({
  repoPaths: [],
  activeRepo: '',

  loadRepos: () => {
    // No-op: repos are loaded from persisted state at creation time.
  },

  addRepository: (path: string) => {
    const { repoPaths, _persist } = get();
    const trimmed = path.trim();
    if (!trimmed || repoPaths.includes(trimmed)) return;
    const updated = [...repoPaths, trimmed];
    set({ repoPaths: updated, activeRepo: trimmed });
    _persist();
  },

  addMultipleRepos: (paths: string[]) => {
    const { repoPaths, addToast, _persist } = get();
    const newPaths = paths.filter(p => !repoPaths.includes(p));
    if (newPaths.length === 0) {
      addToast('info', 'No new repositories found');
      return;
    }
    const updated = [...repoPaths, ...newPaths];
    set({ repoPaths: updated, activeRepo: newPaths[0] });
    _persist();
    addToast('success', `Added ${newPaths.length} repository${newPaths.length > 1 ? 'ies' : ''}`, newPaths.map(p => p.split('/').pop()).join(', '));
  },

  removeRepository: (path: string) => {
    const { repoPaths, activeRepo, _persist } = get();
    const updated = repoPaths.filter(p => p !== path);
    set({ repoPaths: updated });
    if (activeRepo === path) {
      set({ activeRepo: updated.length > 0 ? updated[0]! : '' });
    }
    _persist();
  },

  setActiveRepo: (path: string) => {
    set({ activeRepo: path, error: null, focusedWorktreePath: null });
    get()._persist();
  },
});
