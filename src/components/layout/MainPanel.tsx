import { useAppStore } from '../../stores/app-store';
import { WorktreeGrid } from '../worktree/WorktreeGrid';
import { BranchGraph } from '../graph/BranchGraph';
import { MultiRepoDashboard } from '../dashboard/MultiRepoDashboard';
import { ChangesView } from '../changes/ChangesView';
import { AgentClaimsPanel } from '../agent/AgentClaimsPanel';
import { StashPanel } from '../git/StashPanel';
import { WorkflowPanel } from '../workflow/WorkflowPanel';
import { GitFork, Network, Layers, FileEdit, Zap, GitBranch, Play } from 'lucide-react';
import { cn } from '../../lib/utils';
import { TabErrorBoundary } from '../shared/TabErrorBoundary';
import type { TabView } from '../../types';

const tabs: { id: TabView; label: string; icon: typeof GitFork }[] = [
  { id: 'worktrees', label: 'Worktrees', icon: GitFork },
  { id: 'changes', label: 'Changes', icon: FileEdit },
  { id: 'graph', label: 'Branch Graph', icon: Network },
  { id: 'stashes', label: 'Stashes', icon: GitBranch },
  { id: 'agent', label: 'Agent', icon: Zap },
  { id: 'workflows', label: 'Workflows', icon: Play },
  { id: 'multi-repo', label: 'Multi-Repo', icon: Layers },
];

export function MainPanel() {
  const activeTab = useAppStore(s => s.activeTab);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const activeRepo = useAppStore(s => s.activeRepo);

  if (!activeRepo && activeTab !== 'multi-repo' && activeTab !== 'changes' && activeTab !== 'worktrees' && activeTab !== 'agent' && activeTab !== 'stashes') {
    return (
      <div className="flex-1 bg-surface-2 flex items-center justify-center">
        <div className="text-center">
          <GitFork className="w-12 h-12 text-white/10 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-white/30 mb-2">No Repository Selected</h2>
          <p className="text-sm text-white/20">Add a repository from the sidebar to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-surface-2 flex flex-col overflow-hidden">
      {/* Tab Bar */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-white/5">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 -mb-px',
              activeTab === id
                ? 'text-white/90 border-indigo-500 bg-white/5'
                : 'text-white/40 border-transparent hover:text-white/60 hover:bg-white/[0.02]'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'worktrees' && (
          <TabErrorBoundary tabName="Worktrees">
            <div className="flex-1 overflow-auto"><WorktreeGrid /></div>
          </TabErrorBoundary>
        )}
        {activeTab === 'changes' && (
          <TabErrorBoundary tabName="Changes">
            <ChangesView />
          </TabErrorBoundary>
        )}
        {activeTab === 'graph' && (
          <TabErrorBoundary tabName="Branch Graph">
            <div className="flex-1 overflow-auto"><BranchGraph /></div>
          </TabErrorBoundary>
        )}
        {activeTab === 'stashes' && activeRepo && (
          <TabErrorBoundary tabName="Stashes">
            <div className="flex-1 overflow-auto p-4"><StashPanel repoPath={activeRepo} /></div>
          </TabErrorBoundary>
        )}
        {activeTab === 'agent' && (
          <TabErrorBoundary tabName="Agent">
            <div className="flex-1 overflow-auto p-4"><AgentClaimsPanel /></div>
          </TabErrorBoundary>
        )}
        {activeTab === 'workflows' && activeRepo && (
          <TabErrorBoundary tabName="Workflows">
            <div className="flex-1 overflow-auto p-4"><WorkflowPanel repoPath={activeRepo} /></div>
          </TabErrorBoundary>
        )}
        {activeTab === 'multi-repo' && (
          <TabErrorBoundary tabName="Multi-Repo">
            <div className="flex-1 overflow-auto"><MultiRepoDashboard /></div>
          </TabErrorBoundary>
        )}
      </div>
    </div>
  );
}
