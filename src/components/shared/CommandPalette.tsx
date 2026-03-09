import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../stores/app-store';
import { Kbd } from '../ui/Kbd';
import {
  Search, Plus, GitFork, RefreshCw, LayoutGrid, List, Table2,
  GitGraph, FileDiff, Archive, Bot, FolderTree, Sun, Moon,
  Settings, PanelLeft
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  shortcut?: string[];
  action: () => void;
  category: string;
}

export function CommandPalette() {
  const open = useAppStore(s => s.commandPaletteOpen);
  const setOpen = useAppStore(s => s.setCommandPaletteOpen);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const setViewMode = useAppStore(s => s.setViewMode);
  const loadData = useAppStore(s => s.loadData);
  const toggleTheme = useAppStore(s => s.toggleTheme);
  const setSettingsOpen = useAppStore(s => s.setSettingsOpen);
  const setSidebarCollapsed = useAppStore(s => s.setSidebarCollapsed);
  const sidebarCollapsed = useAppStore(s => s.sidebarCollapsed);
  const theme = useAppStore(s => s.theme);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = useMemo(() => [
    {
      id: 'new-worktree',
      label: 'New Worktree',
      description: 'Create a new git worktree',
      icon: <Plus className="w-4 h-4" />,
      shortcut: ['⌘', 'N'],
      action: () => { setOpen(false); /* trigger from outside */ },
      category: 'Worktrees',
    },
    {
      id: 'refresh',
      label: 'Refresh Data',
      description: 'Reload worktrees and branches',
      icon: <RefreshCw className="w-4 h-4" />,
      shortcut: ['⌘', 'R'],
      action: () => { loadData(); setOpen(false); },
      category: 'General',
    },
    {
      id: 'worktrees-view',
      label: 'Go to Worktrees',
      description: 'View and manage worktrees',
      icon: <GitFork className="w-4 h-4" />,
      action: () => { setActiveTab('worktrees'); setOpen(false); },
      category: 'Navigation',
    },
    {
      id: 'changes-view',
      label: 'Go to Changes',
      description: 'View changes and staging',
      icon: <FileDiff className="w-4 h-4" />,
      action: () => { setActiveTab('changes'); setOpen(false); },
      category: 'Navigation',
    },
    {
      id: 'stashes-view',
      label: 'Go to Stashes',
      description: 'Manage stashed changes',
      icon: <Archive className="w-4 h-4" />,
      action: () => { setActiveTab('stashes'); setOpen(false); },
      category: 'Navigation',
    },
    {
      id: 'agent-view',
      label: 'Go to Agent',
      description: 'Access AI agent tools',
      icon: <Bot className="w-4 h-4" />,
      action: () => { setActiveTab('agent'); setOpen(false); },
      category: 'Navigation',
    },
    {
      id: 'multirepo-view',
      label: 'Go to Multi-Repo',
      description: 'Manage multiple repositories',
      icon: <FolderTree className="w-4 h-4" />,
      action: () => { setActiveTab('multi-repo'); setOpen(false); },
      category: 'Navigation',
    },
    {
      id: 'graph-view',
      label: 'Go to Graph',
      description: 'View branch commit graph',
      icon: <GitGraph className="w-4 h-4" />,
      action: () => { setActiveTab('graph'); setOpen(false); },
      category: 'Navigation',
    },
    {
      id: 'view-grid',
      label: 'Grid View',
      description: 'Switch to grid layout',
      icon: <LayoutGrid className="w-4 h-4" />,
      shortcut: ['⌘', '1'],
      action: () => { setViewMode('grid'); setOpen(false); },
      category: 'View',
    },
    {
      id: 'view-list',
      label: 'List View',
      description: 'Switch to list layout',
      icon: <List className="w-4 h-4" />,
      shortcut: ['⌘', '2'],
      action: () => { setViewMode('list'); setOpen(false); },
      category: 'View',
    },
    {
      id: 'view-table',
      label: 'Table View',
      description: 'Switch to table layout',
      icon: <Table2 className="w-4 h-4" />,
      shortcut: ['⌘', '3'],
      action: () => { setViewMode('table'); setOpen(false); },
      category: 'View',
    },
    {
      id: 'toggle-theme',
      label: 'Toggle Theme',
      description: `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`,
      icon: theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />,
      action: () => { toggleTheme(); setOpen(false); },
      category: 'General',
    },
    {
      id: 'open-settings',
      label: 'Open Settings',
      description: 'Configure application settings',
      icon: <Settings className="w-4 h-4" />,
      action: () => { setSettingsOpen(true); setOpen(false); },
      category: 'General',
    },
    {
      id: 'toggle-sidebar',
      label: 'Toggle Sidebar',
      description: `${sidebarCollapsed ? 'Show' : 'Hide'} sidebar`,
      icon: <PanelLeft className="w-4 h-4" />,
      action: () => { setSidebarCollapsed(!sidebarCollapsed); setOpen(false); },
      category: 'General',
    },
  ], [loadData, setActiveTab, setViewMode, setOpen, toggleTheme, setSettingsOpen, setSidebarCollapsed, sidebarCollapsed, theme]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, filtered, selectedIndex, setOpen]);

  // Global shortcut to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, setOpen]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const cmd of filtered) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filtered]);

  let runningIndex = 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-md"
          >
            <div className="bg-surface-3 border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                <Search className="w-4 h-4 text-white/30 shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                  placeholder="Type a command..."
                  className="flex-1 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/30"
                />
                <Kbd>ESC</Kbd>
              </div>

              {/* Results */}
              <div className="max-h-72 overflow-auto py-1">
                {filtered.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-white/30">
                    No commands found
                  </div>
                )}
                {Object.entries(grouped).map(([category, items]) => (
                  <div key={category}>
                    <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-white/20 font-semibold">
                      {category}
                    </div>
                    {items.map(item => {
                      const idx = runningIndex++;
                      return (
                        <button
                          key={item.id}
                          onClick={item.action}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                            idx === selectedIndex
                              ? 'bg-white/5 text-white'
                              : 'text-white/60 hover:bg-white/[0.02]'
                          )}
                        >
                          <span className="text-white/40">{item.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm">{item.label}</div>
                            {item.description && (
                              <div className="text-xs text-white/30 truncate">{item.description}</div>
                            )}
                          </div>
                          {item.shortcut && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              {item.shortcut.map((k, i) => (
                                <Kbd key={i}>{k}</Kbd>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
