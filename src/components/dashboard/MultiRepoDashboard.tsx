import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/app-store';
import { RepoOverviewCard } from './RepoOverviewCard';
import { Layers, Loader2 } from 'lucide-react';

const INITIAL_LOAD_MS = 400;

export function MultiRepoDashboard() {
  const repoPaths = useAppStore(s => s.repoPaths);
  const activeRepo = useAppStore(s => s.activeRepo);
  const setActiveRepo = useAppStore(s => s.setActiveRepo);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const [showSpinner, setShowSpinner] = useState(true);

  useEffect(() => {
    if (repoPaths.length === 0) {
      setShowSpinner(false);
      return;
    }
    setShowSpinner(true);
    const t = setTimeout(() => setShowSpinner(false), INITIAL_LOAD_MS);
    return () => clearTimeout(t);
  }, [repoPaths.length]);

  const handleSwitch = (path: string) => {
    setActiveRepo(path);
    setActiveTab('worktrees');
  };

  if (repoPaths.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 gap-4">
        <Layers className="w-12 h-12 text-white/10" />
        <h3 className="text-sm font-medium text-white/50">No repositories</h3>
        <p className="text-xs text-white/30">Add repositories from the sidebar to see them here.</p>
      </div>
    );
  }

  return (
    <div className="p-6 relative">
      {showSpinner && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-2/80 z-10 rounded-lg">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-sm text-white/50">Loading repositories...</p>
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        <Layers className="w-4 h-4 text-indigo-400" />
        <h2 className="text-sm font-semibold text-white/80">All Repositories</h2>
        <span className="text-xs text-white/30">{repoPaths.length} repos</span>
      </div>
      <p className="text-xs text-white/30 mb-4">
        Same list as the sidebar. <strong className="text-white/50">Active</strong> is the repo used in Worktrees, Changes and Graph. Use &quot;Switch to repo&quot; to change it.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {repoPaths.map(path => (
          <RepoOverviewCard
            key={path}
            repoPath={path}
            isActive={path === activeRepo}
            onSwitch={handleSwitch}
          />
        ))}
      </div>
    </div>
  );
}
