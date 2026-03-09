import type { StateCreator } from 'zustand';
import type { AppState } from '../app-store';
import type { GraphCommit } from '../../types';
import * as cmd from '../../lib/tauri-commands';

export interface GraphSlice {
  graphCommits: GraphCommit[];
  graphLoading: boolean;

  loadGraph: () => Promise<void>;
}

export const createGraphSlice: StateCreator<AppState, [], [], GraphSlice> = (set, get) => ({
  graphCommits: [],
  graphLoading: false,

  loadGraph: async () => {
    const { activeRepo } = get();
    if (!activeRepo) return;
    set({ graphLoading: true });
    try {
      const commits = await cmd.getBranchGraph(activeRepo, 80);
      set({ graphCommits: commits });
    } catch {
      set({ graphCommits: [] });
    } finally {
      set({ graphLoading: false });
    }
  },
});
