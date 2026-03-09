import type { StateCreator } from 'zustand';
import type { AppState } from '../app-store';
import type { WorktreeTemplate } from '../../types/templates';
import { generateId } from '../../lib/utils';

const STORAGE_KEY = 'worktree-templates';

function loadTemplates(): WorktreeTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { }
  return [];
}

function saveTemplates(templates: WorktreeTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export interface TemplateSlice {
  templates: WorktreeTemplate[];
  addTemplate: (template: Omit<WorktreeTemplate, 'id'>) => void;
  updateTemplate: (id: string, updates: Partial<WorktreeTemplate>) => void;
  removeTemplate: (id: string) => void;
}

export const createTemplateSlice: StateCreator<AppState, [], [], TemplateSlice> = (set, get) => ({
  templates: loadTemplates(),

  addTemplate: (template) => {
    const newTemplate = { ...template, id: generateId() };
    const updated = [...get().templates, newTemplate];
    set({ templates: updated });
    saveTemplates(updated);
  },

  updateTemplate: (id, updates) => {
    const updated = get().templates.map(t => t.id === id ? { ...t, ...updates } : t);
    set({ templates: updated });
    saveTemplates(updated);
  },

  removeTemplate: (id) => {
    const updated = get().templates.filter(t => t.id !== id);
    set({ templates: updated });
    saveTemplates(updated);
  },
});
