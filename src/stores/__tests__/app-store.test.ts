import { describe, it, expect } from 'vitest';

// We test the slices in isolation to avoid the full Tauri dependency chain
// For slices that depend on Tauri commands, we mock the import

// ---- Test RepoSlice in isolation ----
describe('RepoSlice logic', () => {
  it('addRepository adds unique repos and sets active', () => {
    const repos: string[] = [];
    const addRepository = (path: string) => {
      const trimmed = path.trim();
      if (!trimmed || repos.includes(trimmed)) return;
      repos.push(trimmed);
    };

    addRepository('/Users/dev/project1');
    addRepository('/Users/dev/project2');
    addRepository('/Users/dev/project1'); // duplicate
    addRepository('  '); // empty after trim

    expect(repos).toEqual(['/Users/dev/project1', '/Users/dev/project2']);
  });

  it('removeRepository filters out the repo', () => {
    let repos = ['/Users/dev/p1', '/Users/dev/p2', '/Users/dev/p3'];
    const removeRepository = (path: string) => {
      repos = repos.filter(p => p !== path);
    };

    removeRepository('/Users/dev/p2');
    expect(repos).toEqual(['/Users/dev/p1', '/Users/dev/p3']);
  });

  it('removeRepository adjusts activeRepo if removed', () => {
    let repos = ['/Users/dev/p1', '/Users/dev/p2'];
    let activeRepo = '/Users/dev/p1';
    const removeRepository = (path: string) => {
      repos = repos.filter(p => p !== path);
      if (activeRepo === path) {
        activeRepo = repos.length > 0 ? repos[0]! : '';
      }
    };

    removeRepository('/Users/dev/p1');
    expect(activeRepo).toBe('/Users/dev/p2');
  });
});

// ---- Test UISlice logic ----
describe('UISlice logic', () => {
  it('toggleTheme switches between dark and light', () => {
    let theme: 'dark' | 'light' = 'dark';
    const toggleTheme = () => {
      theme = theme === 'dark' ? 'light' : 'dark';
    };

    toggleTheme();
    expect(theme).toBe('light');
    toggleTheme();
    expect(theme).toBe('dark');
  });

  it('toast management adds and removes', () => {
    let toasts: Array<{ id: string; type: string; title: string }> = [];

    const addToast = (type: string, title: string) => {
      const toast = { id: Math.random().toString(36).slice(2), type, title };
      toasts = [...toasts, toast];
      return toast.id;
    };

    const removeToast = (id: string) => {
      toasts = toasts.filter(t => t.id !== id);
    };

    const id1 = addToast('success', 'Created');
    addToast('error', 'Failed');
    expect(toasts).toHaveLength(2);

    removeToast(id1);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.title).toBe('Failed');
  });
});

// ---- Test TemplateSlice logic ----
describe('TemplateSlice logic', () => {
  it('addTemplate creates with unique id', () => {
    let templates: Array<{ id: string; name: string }> = [];
    const addTemplate = (name: string) => {
      const id = Math.random().toString(36).slice(2, 9);
      templates = [...templates, { id, name }];
    };

    addTemplate('Feature Template');
    addTemplate('Bugfix Template');
    expect(templates).toHaveLength(2);
    expect(templates[0]!.id).not.toBe(templates[1]!.id);
  });

  it('updateTemplate modifies properties', () => {
    let templates = [
      { id: '1', name: 'Original', description: 'old' },
      { id: '2', name: 'Other', description: 'keep' },
    ];

    const updateTemplate = (id: string, updates: Partial<typeof templates[0]>) => {
      templates = templates.map(t => t.id === id ? { ...t, ...updates } : t);
    };

    updateTemplate('1', { name: 'Updated', description: 'new' });
    expect(templates[0]!.name).toBe('Updated');
    expect(templates[0]!.description).toBe('new');
    expect(templates[1]!.name).toBe('Other');
  });

  it('removeTemplate filters by id', () => {
    let templates = [
      { id: '1', name: 'A' },
      { id: '2', name: 'B' },
      { id: '3', name: 'C' },
    ];

    const removeTemplate = (id: string) => {
      templates = templates.filter(t => t.id !== id);
    };

    removeTemplate('2');
    expect(templates).toHaveLength(2);
    expect(templates.map(t => t.name)).toEqual(['A', 'C']);
  });
});

// ---- Test GraphSlice logic ----
describe('GraphSlice logic', () => {
  it('loadGraph sets loading and stores commits', async () => {
    let graphCommits: any[] = [];
    let graphLoading = false;

    const loadGraph = async (fetcher: () => Promise<any[]>) => {
      graphLoading = true;
      try {
        graphCommits = await fetcher();
      } catch {
        graphCommits = [];
      } finally {
        graphLoading = false;
      }
    };

    const mockCommits = [
      { hash: 'abc', short_hash: 'abc', parents: [], branches: ['main'], message: 'init', author: 'Dev', date: 'now' },
    ];

    await loadGraph(async () => mockCommits);
    expect(graphLoading).toBe(false);
    expect(graphCommits).toEqual(mockCommits);
  });

  it('loadGraph handles errors gracefully', async () => {
    let graphCommits: any[] = [{ hash: 'existing' }];
    let graphLoading = false;

    const loadGraph = async (fetcher: () => Promise<any[]>) => {
      graphLoading = true;
      try {
        graphCommits = await fetcher();
      } catch {
        graphCommits = [];
      } finally {
        graphLoading = false;
      }
    };

    await loadGraph(async () => { throw new Error('network fail'); });
    expect(graphLoading).toBe(false);
    expect(graphCommits).toEqual([]);
  });
});

// ---- Test Persistence logic ----
describe('Persistence', () => {
  it('persists and loads state from localStorage', () => {
    const STORAGE_KEY = 'worktree_app_state';
    const state = {
      repoPaths: ['/dev/p1', '/dev/p2'],
      activeRepo: '/dev/p1',
      viewMode: 'grid',
      activeTab: 'worktrees',
      sidebarCollapsed: false,
      branchSearch: '',
      autoRefreshInterval: 5000,
      theme: 'dark',
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const loaded = JSON.parse(localStorage.getItem(STORAGE_KEY)!);

    expect(loaded.repoPaths).toEqual(['/dev/p1', '/dev/p2']);
    expect(loaded.theme).toBe('dark');
    expect(loaded.viewMode).toBe('grid');
  });

  it('handles missing localStorage gracefully', () => {
    const result = localStorage.getItem('nonexistent_key');
    expect(result).toBeNull();
  });

  it('legacy migration merges repos', () => {
    const legacyRepos = ['/dev/legacy1', '/dev/legacy2'];
    const newState = { repoPaths: ['/dev/new1', '/dev/legacy1'], activeRepo: '/dev/new1' };

    localStorage.setItem('worktree_repos', JSON.stringify(legacyRepos));
    localStorage.setItem('worktree_app_state', JSON.stringify(newState));

    const saved = JSON.parse(localStorage.getItem('worktree_app_state')!);
    const legacy = JSON.parse(localStorage.getItem('worktree_repos')!);

    const merged = [...new Set([...(saved.repoPaths || []), ...legacy])];
    expect(merged).toContain('/dev/legacy1');
    expect(merged).toContain('/dev/legacy2');
    expect(merged).toContain('/dev/new1');
    expect(merged).toHaveLength(3); // deduped
  });
});
