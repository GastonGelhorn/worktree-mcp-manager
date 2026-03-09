import { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { RepoSelector } from '../sidebar/RepoSelector';
import { WorktreeList } from '../sidebar/WorktreeList';
import { BranchTree } from '../sidebar/BranchTree';
import { PanelLeftClose, PanelLeft, Search, X } from 'lucide-react';

export function Sidebar() {
  const [sidebarSearch, setSidebarSearch] = useState('');
  const sidebarCollapsed = useAppStore(s => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore(s => s.setSidebarCollapsed);

  if (sidebarCollapsed) {
    return (
      <div className="w-12 border-r border-white/5 bg-surface-1 flex flex-col items-center py-3 gap-2">
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors"
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-72 border-r border-white/5 bg-surface-1 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Explorer</span>
        <button
          onClick={() => setSidebarCollapsed(true)}
          className="p-1 rounded hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
        >
          <PanelLeftClose className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-3 py-1.5">
        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/5 border border-white/5">
          <Search className="w-3 h-3 text-white/30 shrink-0" />
          <input
            value={sidebarSearch}
            onChange={e => setSidebarSearch(e.target.value)}
            placeholder="Filter..."
            className="flex-1 bg-transparent text-xs text-white/70 outline-none placeholder:text-white/30"
          />
          {sidebarSearch && (
            <button onClick={() => setSidebarSearch('')} className="text-white/30 hover:text-white/50">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <RepoSelector />
      <WorktreeList filter={sidebarSearch} />
      <BranchTree filter={sidebarSearch} />
    </div>
  );
}
