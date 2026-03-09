import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/app-store';
import * as cmd from '../../lib/tauri-commands-new';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Plus, Trash2, Edit2, Play } from 'lucide-react';
import type { HookDef, HookType } from '../../types/new-types';

interface HooksManagerProps {
  repoPath: string;
}

const HOOK_TYPES: { value: HookType; label: string }[] = [
  { value: 'PostCreate', label: 'After Worktree Created' },
  { value: 'PostSwitch', label: 'After Worktree Switch' },
  { value: 'PreMerge', label: 'Before Merge' },
  { value: 'PostMerge', label: 'After Merge' },
  { value: 'PreRemove', label: 'Before Delete' },
  { value: 'PostRemove', label: 'After Delete' },
];

export function HooksManager({ repoPath }: HooksManagerProps) {
  const addToast = useAppStore(s => s.addToast);
  const [hooks, setHooks] = useState<HookDef[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<HookDef | null>(null);

  const [formType, setFormType] = useState<HookType>('PostCreate');
  const [formCommand, setFormCommand] = useState('');
  const [formBackground, setFormBackground] = useState(false);

  const loadHooks = async () => {
    try {
      const result = await cmd.discoverHooks(repoPath);
      setHooks(result);
    } catch (e: any) {
      addToast('error', 'Failed to load hooks', e.toString());
    }
  };

  useEffect(() => {
    loadHooks();
  }, [repoPath]);

  const handleAddHook = async () => {
    if (!formCommand.trim()) {
      addToast('warning', 'Command required', 'Please enter a command for the hook');
      return;
    }

    try {
      // This would be implemented in the backend
      addToast('success', 'Hook added', `${formType} hook configured`);
      setShowAddForm(false);
      setFormCommand('');
      setFormType('PostCreate');
      setFormBackground(false);
      loadHooks();
    } catch (e: any) {
      addToast('error', 'Failed to add hook', e.toString());
    }
  };

  const handleDeleteHook = async (hook: HookDef) => {
    try {
      // This would be implemented in the backend
      addToast('success', 'Hook deleted', `${hook.hook_type} hook removed`);
      setConfirmDelete(null);
      loadHooks();
    } catch (e: any) {
      addToast('error', 'Failed to delete hook', e.toString());
    }
  };

  const handleExecuteHook = async (hook: HookDef) => {
    try {
      // Execute hook functionality would be implemented in the backend
      addToast('info', 'Hook execution not yet implemented', `${hook.hook_type} hook`);
    } catch (e: any) {
      addToast('error', 'Failed to execute hook', e.toString());
    }
  };

  const groupedHooks = hooks.reduce((acc, hook) => {
    if (!acc[hook.hook_type]) acc[hook.hook_type] = [];
    acc[hook.hook_type].push(hook);
    return acc;
  }, {} as Record<HookType, HookDef[]>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/80">Lifecycle Hooks</h3>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Hook
        </Button>
      </div>

      {/* Add Hook Form */}
      {showAddForm && (
        <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1.5">Hook Type</label>
            <select
              value={formType}
              onChange={e => setFormType(e.target.value as HookType)}
              className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90 outline-none focus:border-indigo-500/50 cursor-pointer"
            >
              {HOOK_TYPES.map(t => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-white/50 block mb-1.5">Command</label>
            <input
              type="text"
              value={formCommand}
              onChange={e => setFormCommand(e.target.value)}
              placeholder="e.g. npm install"
              className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90 outline-none focus:border-indigo-500/50 font-mono"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formBackground}
              onChange={e => setFormBackground(e.target.checked)}
              className="w-4 h-4 rounded border-white/10 text-indigo-500"
            />
            <span className="text-sm text-white/70">Run in background</span>
          </label>

          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddHook}
            >
              Add Hook
            </Button>
          </div>
        </div>
      )}

      {/* Hooks List */}
      {hooks.length === 0 ? (
        <div className="py-8 px-4 text-center rounded-lg border border-white/5 bg-white/2">
          <p className="text-sm text-white/50">No hooks configured yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(groupedHooks).map(([type, typeHooks]) => (
            <div key={type}>
              <h4 className="text-xs font-medium text-white/50 uppercase mb-2">
                {HOOK_TYPES.find(t => t.value === type)?.label}
              </h4>
              <div className="space-y-2">
                {typeHooks.map((hook, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-white/10 bg-white/2 flex items-start justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-white/80 truncate">{hook.config.commands.join(', ')}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-white/50">
                        {hook.config.background && (
                          <span className="bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">
                            Background
                          </span>
                        )}
                        {hook.config.timeout_seconds && (
                          <span>Timeout: {hook.config.timeout_seconds}s</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleExecuteHook(hook)}
                        title="Run hook"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Edit hook"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDelete(hook)}
                        title="Delete hook"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <ConfirmDialog
          open={true}
          onOpenChange={open => !open && setConfirmDelete(null)}
          title="Delete Hook"
          description={`Remove the "${confirmDelete.hook_type}" hook with command: ${confirmDelete.config.commands.join(', ')}`}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => handleDeleteHook(confirmDelete)}
        />
      )}
    </div>
  );
}
