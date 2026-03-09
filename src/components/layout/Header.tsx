import { useAppStore } from '../../stores/app-store';
import { GitBranch, FolderGit2, Settings, Sun, Moon, Loader2 } from 'lucide-react';
import { Kbd } from '../ui/Kbd';
import { basename } from '../../lib/utils';

export function Header() {
  const setCommandPaletteOpen = useAppStore(s => s.setCommandPaletteOpen);
  const setSettingsOpen = useAppStore(s => s.setSettingsOpen);
  const activeRepo = useAppStore(s => s.activeRepo);
  const worktrees = useAppStore(s => s.worktrees);
  const focusedWorktreePath = useAppStore(s => s.focusedWorktreePath);
  const theme = useAppStore(s => s.theme);
  const toggleTheme = useAppStore(s => s.toggleTheme);
  const loading = useAppStore(s => s.loading);
  const graphLoading = useAppStore(s => s.graphLoading);
  const actionInProgress = loading || graphLoading;

  const projectName = activeRepo ? basename(activeRepo) : null;
  const focusedWorktree = focusedWorktreePath
    ? worktrees.find(w => w.path === focusedWorktreePath)
    : null;
  const focusedLabel = focusedWorktree
    ? `${basename(focusedWorktree.path)} (${focusedWorktree.branch?.replace('refs/heads/', '') ?? 'detached'})`
    : null;

  return (
    <div data-tauri-drag-region className="h-11 w-full border-b border-white/5 flex items-center justify-between pr-4 pl-0 shrink-0 bg-surface-3/80 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 pl-3 min-w-0" data-tauri-drag-region>
        <GitBranch className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <h1 className="text-xs font-semibold text-white/50 uppercase tracking-widest shrink-0" data-tauri-drag-region>
          Worktree MCP Manager
        </h1>
        {projectName && (
          <>
            <span className="text-white/15 text-xs shrink-0">/</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <FolderGit2 className="w-3 h-3 text-indigo-400/70 shrink-0" />
              <span className="text-xs font-medium text-white/70 truncate" data-tauri-drag-region title={activeRepo ?? undefined}>
                {projectName}
              </span>
            </div>
          </>
        )}
        {focusedLabel && (
          <>
            <span className="text-white/15 text-xs shrink-0">/</span>
            <span className="text-xs text-white/50 truncate" data-tauri-drag-region title={focusedWorktreePath ?? undefined}>
              {focusedLabel}
            </span>
          </>
        )}
        {actionInProgress && (
          <span className="flex items-center gap-1.5 ml-2 text-white/40" title="Loading...">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span className="text-[10px] uppercase tracking-wider">Loading</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-white/40 hover:text-white/60 text-xs"
        >
          <span>Search actions...</span>
          <div className="flex items-center gap-0.5">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </div>
        </button>
        <button
          onClick={toggleTheme}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-white/50 hover:text-white/70 text-xs"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-white/30 hover:text-white/60"
          title="Settings (⌘,)"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
