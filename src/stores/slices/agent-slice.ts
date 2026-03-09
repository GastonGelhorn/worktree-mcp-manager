import type { StateCreator } from 'zustand';
import type { AgentClaim, ClaimsFile, CiResult, WorktreeState } from '../../types';
import * as cmd from '../../lib/tauri-commands';

export interface AgentSlice {
  // Agent claims state
  agentClaims: Record<string, AgentClaim>;
  agentClaimsLoading: boolean;

  // CI status cache
  ciStatusCache: Record<string, CiResult>;

  // Worktree state cache
  worktreeStateCache: Record<string, WorktreeState>;

  // Actions
  loadAgentClaims: (repoPath: string) => Promise<void>;
  loadCiStatus: (repoPath: string, branch: string) => Promise<void>;
  loadWorktreeState: (wtPath: string) => Promise<void>;
  clearCaches: () => void;
}

export const createAgentSlice: StateCreator<AgentSlice> = (set) => ({
  agentClaims: {},
  agentClaimsLoading: false,
  ciStatusCache: {},
  worktreeStateCache: {},

  loadAgentClaims: async (repoPath: string) => {
    set({ agentClaimsLoading: true });
    try {
      const result: ClaimsFile = await cmd.agentListClaims(repoPath);
      set({ agentClaims: result.claims, agentClaimsLoading: false });
    } catch {
      set({ agentClaimsLoading: false });
    }
  },

  loadCiStatus: async (repoPath: string, branch: string) => {
    try {
      const result = await cmd.getCiStatus(repoPath, branch);
      set((state) => ({
        ciStatusCache: { ...state.ciStatusCache, [branch]: result },
      }));
    } catch {
      // CI status may not be available
    }
  },

  loadWorktreeState: async (wtPath: string) => {
    try {
      const result = await cmd.getWorktreeState(wtPath);
      set((state) => ({
        worktreeStateCache: { ...state.worktreeStateCache, [wtPath]: result },
      }));
    } catch {
      // State may not be loadable
    }
  },

  clearCaches: () => {
    set({
      ciStatusCache: {},
      worktreeStateCache: {},
      agentClaims: {},
    });
  },
});
