import { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import type { WorktreeTemplate } from '../../types/templates';

export function TemplateManager() {
  const templates = useAppStore(s => s.templates);
  const addTemplate = useAppStore(s => s.addTemplate);
  const updateTemplate = useAppStore(s => s.updateTemplate);
  const removeTemplate = useAppStore(s => s.removeTemplate);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<WorktreeTemplate, 'id'>>({
    name: '',
    description: '',
    branchPrefix: '',
    herdLink: false,
    dbStrategy: 'shared',
    assignVitePort: false,
    injectClaudeContext: false,
  });

  const resetForm = () => {
    setForm({ name: '', description: '', branchPrefix: '', herdLink: false, dbStrategy: 'shared', assignVitePort: false, injectClaudeContext: false });
    setShowForm(false);
    setEditingId(null);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editingId) {
      updateTemplate(editingId, form);
    } else {
      addTemplate(form);
    }
    resetForm();
  };

  const startEdit = (t: WorktreeTemplate) => {
    setForm({ name: t.name, description: t.description, branchPrefix: t.branchPrefix, herdLink: t.herdLink, dbStrategy: t.dbStrategy, assignVitePort: t.assignVitePort, injectClaudeContext: t.injectClaudeContext });
    setEditingId(t.id);
    setShowForm(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-white/80">Worktree Templates</h3>
          <p className="text-[11px] text-white/30 mt-0.5">Pre-configured settings for quick worktree creation.</p>
        </div>
        {!showForm && (
          <Button variant="ghost" size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="w-3.5 h-3.5" /> New
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="p-3 flex flex-col gap-3">
          <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Template name" className="text-xs" />
          <Input value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" className="text-xs" />
          <Input value={form.branchPrefix || ''} onChange={e => setForm({ ...form, branchPrefix: e.target.value })} placeholder="Branch prefix (e.g. feature/)" className="text-xs" />
          <div className="flex flex-wrap gap-3 text-xs text-white/60">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.herdLink} onChange={e => setForm({ ...form, herdLink: e.target.checked })} className="accent-indigo-500" />
              Herd Link
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.assignVitePort} onChange={e => setForm({ ...form, assignVitePort: e.target.checked })} className="accent-indigo-500" />
              Vite Port
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.injectClaudeContext} onChange={e => setForm({ ...form, injectClaudeContext: e.target.checked })} className="accent-indigo-500" />
              CLAUDE.md
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.dbStrategy === 'isolated'} onChange={e => setForm({ ...form, dbStrategy: e.target.checked ? 'isolated' : 'shared' })} className="accent-indigo-500" />
              Isolated DB
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={resetForm}><X className="w-3 h-3" /> Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleSave}><Check className="w-3 h-3" /> {editingId ? 'Update' : 'Save'}</Button>
          </div>
        </Card>
      )}

      {templates.length === 0 && !showForm && (
        <p className="text-xs text-white/20 italic">No templates yet. Create one to speed up worktree creation.</p>
      )}

      {templates.map(t => (
        <Card key={t.id} className="p-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/80 font-medium truncate">{t.name}</p>
            {t.description && <p className="text-[11px] text-white/30 truncate">{t.description}</p>}
            <div className="flex gap-2 mt-1 text-[10px] text-white/25">
              {t.branchPrefix && <span>prefix: {t.branchPrefix}</span>}
              {t.herdLink && <span>herd</span>}
              {t.assignVitePort && <span>vite</span>}
              {t.injectClaudeContext && <span>claude</span>}
              {t.dbStrategy === 'isolated' && <span>iso-db</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => startEdit(t)}><Edit2 className="w-3 h-3" /></Button>
            <Button variant="ghost" size="sm" onClick={() => removeTemplate(t.id)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
