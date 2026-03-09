import type { StateCreator } from 'zustand';
import type { AppState } from '../app-store';
import type { ViewMode, TabView, ToastMessage } from '../../types';
import { generateId } from '../../lib/utils';
import { setHash } from '../../lib/router';
import { applyTheme, type Theme } from '../../lib/theme';

export type { Theme } from '../../lib/theme';

export interface UISlice {
  viewMode: ViewMode;
  activeTab: TabView;
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  settingsOpen: boolean;
  toasts: ToastMessage[];
  branchSearch: string;
  autoRefreshInterval: number;
  theme: Theme;
  postCreateWorktreeCommand: string;
  llmCommitTemplate: string;

  setViewMode: (mode: ViewMode) => void;
  setPostCreateWorktreeCommand: (cmd: string) => void;
  setLlmCommitTemplate: (template: string) => void;
  setActiveTab: (tab: TabView) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setBranchSearch: (search: string) => void;
  setAutoRefreshInterval: (interval: number) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  addToast: (type: ToastMessage['type'], title: string, description?: string) => void;
  removeToast: (id: string) => void;
}

export const createUISlice: StateCreator<AppState, [], [], UISlice> = (set, get) => ({
  viewMode: 'grid',
  activeTab: 'worktrees',
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  settingsOpen: false,
  toasts: [],
  branchSearch: '',
  autoRefreshInterval: 0,
  theme: 'dark',
  postCreateWorktreeCommand: '',
  llmCommitTemplate: 'Write a concise commit message in Conventional Commits format for the following git diff. Output ONLY the commit message, no explanations or markdown backticks.\n\n{diff}',

  setViewMode: (mode) => { set({ viewMode: mode }); get()._persist(); },
  setPostCreateWorktreeCommand: (cmd) => { set({ postCreateWorktreeCommand: cmd }); get()._persist(); },
  setLlmCommitTemplate: (template) => { set({ llmCommitTemplate: template }); get()._persist(); },
  setActiveTab: (tab) => { set({ activeTab: tab }); setHash(tab); get()._persist(); },
  setSidebarCollapsed: (collapsed) => { set({ sidebarCollapsed: collapsed }); get()._persist(); },
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setBranchSearch: (search) => { set({ branchSearch: search }); get()._persist(); },
  setAutoRefreshInterval: (interval) => { set({ autoRefreshInterval: interval }); get()._persist(); },
  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme);
    get()._persist();
  },
  toggleTheme: () => {
    const current = get().theme;
    const next = current === 'dark' ? 'light' : 'dark';
    set({ theme: next });
    applyTheme(next);
    get()._persist();
  },

  addToast: (type, title, description) => {
    const toast: ToastMessage = { id: generateId(), type, title, description };
    set(state => ({ toasts: [...state.toasts, toast] }));
    setTimeout(() => get().removeToast(toast.id), 4000);
  },
  removeToast: (id) => {
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
  },
});
