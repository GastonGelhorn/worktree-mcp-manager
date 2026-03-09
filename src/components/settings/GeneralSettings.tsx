import { useAppStore } from '../../stores/app-store';
import type { ViewMode, TabView } from '../../types';
import { cn } from '../../lib/utils';
import { saveCommitTemplate } from '../../lib/tauri-commands';
import { RotateCw, LayoutGrid, Trash2 } from 'lucide-react';
import { useState } from 'react';

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm text-white/80">{label}</div>
        {description && <div className="text-xs text-white/30 mt-0.5">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SelectControl<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (val: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 outline-none focus:border-indigo-500/50 transition-colors cursor-pointer appearance-none min-w-[120px]"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value} className="bg-surface-3 text-white">
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function GeneralSettings() {
  const viewMode = useAppStore(s => s.viewMode);
  const setViewMode = useAppStore(s => s.setViewMode);
  const activeTab = useAppStore(s => s.activeTab);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const autoRefreshInterval = useAppStore(s => s.autoRefreshInterval);
  const setAutoRefreshInterval = useAppStore(s => s.setAutoRefreshInterval);
  const postCreateWorktreeCommand = useAppStore(s => s.postCreateWorktreeCommand);
  const setPostCreateWorktreeCommand = useAppStore(s => s.setPostCreateWorktreeCommand);
  const llmCommitTemplate = useAppStore(s => s.llmCommitTemplate);
  const setLlmCommitTemplate = useAppStore(s => s.setLlmCommitTemplate);
  const addToast = useAppStore(s => s.addToast);

  const [confirmReset, setConfirmReset] = useState(false);

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    localStorage.removeItem('worktree_app_state');
    addToast('info', 'Settings reset', 'Restart the app to apply defaults');
    setConfirmReset(false);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-lg bg-indigo-500/10">
          <LayoutGrid className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">General</span>
      </div>

      <div className="divide-y divide-white/5">
        <SettingRow label="Auto-refresh" description="Automatically reload data on an interval">
          <SelectControl
            value={String(autoRefreshInterval)}
            onChange={val => setAutoRefreshInterval(Number(val))}
            options={[
              { value: '0', label: 'Off' },
              { value: '10', label: '10 seconds' },
              { value: '30', label: '30 seconds' },
              { value: '60', label: '1 minute' },
            ]}
          />
        </SettingRow>

        <SettingRow label="Default view" description="Layout for the worktrees panel">
          <SelectControl<ViewMode>
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'grid', label: 'Grid' },
              { value: 'list', label: 'List' },
              { value: 'table', label: 'Table' },
            ]}
          />
        </SettingRow>

        <SettingRow label="Default tab" description="Tab shown when opening the app">
          <SelectControl<TabView>
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: 'worktrees', label: 'Worktrees' },
              { value: 'changes', label: 'Changes' },
              { value: 'graph', label: 'Branch Graph' },
            ]}
          />
        </SettingRow>
        <SettingRow
          label="Run after creating worktree"
          description="Optional command run in the new worktree directory (e.g. npm install). Leave empty to skip."
        >
          <input
            type="text"
            value={postCreateWorktreeCommand}
            onChange={e => setPostCreateWorktreeCommand(e.target.value)}
            placeholder="e.g. npm install"
            className="w-48 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 placeholder:text-white/30 focus:outline-none focus:border-indigo-500/50"
          />
        </SettingRow>

        <div className="py-3">
          <div className="min-w-0 mb-2">
            <div className="text-sm text-white/80">LLM Commit Template</div>
            <div className="text-xs text-white/30 mt-0.5">Template piped to the LLM command. Must contain {"{diff}"}.</div>
          </div>
          <textarea
            value={llmCommitTemplate}
            onChange={e => setLlmCommitTemplate(e.target.value)}
            onBlur={() => saveCommitTemplate(llmCommitTemplate).catch(err => addToast('error', 'Failed to save template', String(err)))}
            rows={4}
            className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 font-mono focus:outline-none focus:border-indigo-500/50 resize-y"
          />
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-emerald-500/10">
            <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Integrations</span>
        </div>

        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <div className="mb-4">
            <h4 className="text-sm font-medium text-white/90">Claude Code Integration</h4>
            <p className="text-xs text-white/40 mt-1 leading-relaxed">
              Register this project's MCP server globally so Claude Code can use it in any terminal session.
              This will automatically use the correct path for your machine.
            </p>
          </div>

          <button
            onClick={async () => {
              try {
                const { registerMcpServer } = await import('../../lib/tauri-commands');
                const result = await registerMcpServer();
                addToast('success', 'MCP Registered', result);
              } catch (err) {
                addToast('error', 'Registration Failed', String(err));
              }
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all"
          >
            <RotateCw className="w-3.5 h-3.5" />
            Add to Claude Code
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="mt-8 pt-6 border-t border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-red-500/10">
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </div>
          <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Danger Zone</span>
        </div>

        <button
          onClick={handleReset}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all',
            confirmReset
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-white/5 text-white/50 hover:text-white/70 hover:bg-white/10 border border-white/5'
          )}
        >
          <RotateCw className="w-3.5 h-3.5" />
          {confirmReset ? 'Click again to confirm reset' : 'Reset all settings'}
        </button>
      </div>
    </div >
  );
}
