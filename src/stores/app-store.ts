import { create } from 'zustand';
import { createRepoSlice, type RepoSlice } from './slices/repo-slice';
import { createWorktreeSlice, type WorktreeSlice } from './slices/worktree-slice';
import { createUISlice, type UISlice } from './slices/ui-slice';
import { createGraphSlice, type GraphSlice } from './slices/graph-slice';
import { createTemplateSlice, type TemplateSlice } from './slices/template-slice';
import { createAgentSlice, type AgentSlice } from './slices/agent-slice';

// ── Persistence helpers ──────────────────────────────────────────────
const STORAGE_KEY = 'worktree_app_state';

interface PersistedState {
  repoPaths: string[];
  activeRepo: string;
  viewMode: string;
  activeTab: string;
  sidebarCollapsed: boolean;
  branchSearch: string;
  autoRefreshInterval: number;
  theme: string;
  postCreateWorktreeCommand: string;
  llmCommitTemplate: string;
}

function loadPersistedState(): Partial<PersistedState> {
  try {
    const legacyRepos = localStorage.getItem('worktree_repos');
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      const parsed = JSON.parse(saved);
      if (legacyRepos) {
        try {
          const legacyParsed = JSON.parse(legacyRepos);
          const merged = [...new Set([...(parsed.repoPaths || []), ...legacyParsed])];
          parsed.repoPaths = merged;
        } catch { }
        localStorage.removeItem('worktree_repos');
      }
      return parsed;
    }

    if (legacyRepos) {
      const repos = JSON.parse(legacyRepos);
      localStorage.removeItem('worktree_repos');
      return { repoPaths: repos, activeRepo: repos[0] || '' };
    }
  } catch { }
  return {};
}

// ── Combined state type ──────────────────────────────────────────────
export type AppState = RepoSlice & WorktreeSlice & UISlice & GraphSlice & TemplateSlice & AgentSlice & {
  _persist: () => void;
};

const _persisted = loadPersistedState();

export const useAppStore = create<AppState>()((...args) => {
  const [, get] = args;

  const _persist = () => {
    const state = get();
    const toPersist: PersistedState = {
      repoPaths: state.repoPaths,
      activeRepo: state.activeRepo,
      viewMode: state.viewMode,
      activeTab: state.activeTab,
      sidebarCollapsed: state.sidebarCollapsed,
      branchSearch: state.branchSearch,
      autoRefreshInterval: state.autoRefreshInterval,
      theme: state.theme,
      postCreateWorktreeCommand: state.postCreateWorktreeCommand,
      llmCommitTemplate: state.llmCommitTemplate,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
  };

  const repoSlice = createRepoSlice(...args);
  const worktreeSlice = createWorktreeSlice(...args);
  const uiSlice = createUISlice(...args);
  const graphSlice = createGraphSlice(...args);
  const templateSlice = createTemplateSlice(...args);
  const agentSlice = createAgentSlice(...args);

  return {
    ...repoSlice,
    ...worktreeSlice,
    ...uiSlice,
    ...graphSlice,
    ...templateSlice,
    ...agentSlice,
    _persist,

    // Apply persisted overrides
    repoPaths: _persisted.repoPaths ?? repoSlice.repoPaths,
    activeRepo: _persisted.activeRepo ?? repoSlice.activeRepo,
    viewMode: (_persisted.viewMode as AppState['viewMode']) ?? uiSlice.viewMode,
    activeTab: (() => {
      const t = _persisted.activeTab as AppState['activeTab'];
      return t ?? uiSlice.activeTab;
    })(),
    sidebarCollapsed: _persisted.sidebarCollapsed ?? uiSlice.sidebarCollapsed,
    branchSearch: _persisted.branchSearch ?? uiSlice.branchSearch,
    autoRefreshInterval: _persisted.autoRefreshInterval ?? uiSlice.autoRefreshInterval,
    theme: (_persisted.theme as AppState['theme']) ?? uiSlice.theme,
    postCreateWorktreeCommand: _persisted.postCreateWorktreeCommand ?? uiSlice.postCreateWorktreeCommand,
    llmCommitTemplate: _persisted.llmCommitTemplate ?? uiSlice.llmCommitTemplate,
  };
});
