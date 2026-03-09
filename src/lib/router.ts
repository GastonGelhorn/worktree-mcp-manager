import type { TabView } from '../types';

const VALID_TABS: TabView[] = ['worktrees', 'changes', 'graph', 'stashes', 'agent', 'workflows', 'multi-repo'];

export interface Route {
  tab: TabView;
  params?: Record<string, string>;
}

export function parseHash(hash = window.location.hash): Route {
  const raw = hash.replace(/^#\/?/, '');
  if (!raw) return { tab: 'worktrees' };

  const segments = raw.split('/');
  const tab = segments[0] as TabView;

  if (!VALID_TABS.includes(tab)) return { tab: 'worktrees' };

  // #graph/commit/{hash}
  if (tab === 'graph' && segments[1] === 'commit' && segments[2]) {
    return { tab, params: { commit: segments[2] } };
  }

  return { tab };
}

export function setHash(tab: TabView, params?: Record<string, string>) {
  let hash = `#${tab}`;
  if (params?.['commit']) {
    hash += `/commit/${params['commit']}`;
  }
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  }
}
