import { useEffect, useRef } from 'react';
import { useAppStore } from './stores/app-store';
import * as cmd from './lib/tauri-commands';
import { parseHash, setHash } from './lib/router';
import { applyTheme } from './lib/theme';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { MainPanel } from './components/layout/MainPanel';
import { CommandPalette } from './components/shared/CommandPalette';
import { ToastContainer } from './components/shared/Toast';
import { SettingsDrawer } from './components/settings/SettingsDrawer';
import './styles/globals.css';

function App() {
  const loadRepos = useAppStore(s => s.loadRepos);
  const activeRepo = useAppStore(s => s.activeRepo);
  const loadData = useAppStore(s => s.loadData);
  const setViewMode = useAppStore(s => s.setViewMode);
  const setSettingsOpen = useAppStore(s => s.setSettingsOpen);
  const settingsOpen = useAppStore(s => s.settingsOpen);
  const activeTab = useAppStore(s => s.activeTab);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const autoRefreshInterval = useAppStore(s => s.autoRefreshInterval);
  const theme = useAppStore(s => s.theme);

  // Apply theme to document on mount and when it changes
  // Uses the centralized applyTheme which:
  // - Sets data-theme attribute
  // - Sets CSS variables via inline style (highest specificity)
  // - Injects/removes a <style> tag with utility class overrides
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Sync hash route on mount and listen for hashchange
  useEffect(() => {
    const route = parseHash();
    setActiveTab(route.tab);

    const onHashChange = () => {
      const r = parseHash();
      if (r.tab !== useAppStore.getState().activeTab) {
        // Set directly to avoid re-triggering setHash
        useAppStore.setState({ activeTab: r.tab });
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Keep hash in sync when tab changes programmatically
  useEffect(() => {
    setHash(activeTab);
  }, [activeTab]);

  // Load saved repos on mount
  useEffect(() => {
    loadRepos();
  }, []);

  // Load data when active repo changes
  useEffect(() => {
    loadData();
  }, [activeRepo]);

  // Auto-refresh interval - only as fallback when smart polling isn't active
  useEffect(() => {
    if (!autoRefreshInterval || autoRefreshInterval <= 0) return;
    if (activeRepo) return; // Smart fingerprint polling handles this case
    const interval = setInterval(() => {
      loadData();
    }, autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshInterval, loadData, activeRepo]);

  // Smart git change detection — polls fingerprint every 3s, reloads only when state actually changed
  const lastFingerprint = useRef<string>('');
  useEffect(() => {
    if (!activeRepo) return;
    // Get initial fingerprint
    cmd.getRepoFingerprint(activeRepo).then(fp => { lastFingerprint.current = fp; }).catch(() => {});

    const interval = setInterval(async () => {
      try {
        const fp = await cmd.getRepoFingerprint(activeRepo);
        if (fp !== lastFingerprint.current) {
          lastFingerprint.current = fp;
          loadData();
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [activeRepo, loadData]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case 'r':
            e.preventDefault();
            loadData();
            break;
          case '1':
            e.preventDefault();
            setViewMode('grid');
            break;
          case '2':
            e.preventDefault();
            setViewMode('list');
            break;
          case '3':
            e.preventDefault();
            setViewMode('table');
            break;
          case ',':
            e.preventDefault();
            setSettingsOpen(!settingsOpen);
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loadData, setViewMode, setSettingsOpen, settingsOpen]);

  return (
    <div className="h-screen w-full flex flex-col bg-surface-0">
      <Header />
      <div className="flex-1 overflow-hidden flex">
        <Sidebar />
        <MainPanel />
      </div>
      <CommandPalette />
      <SettingsDrawer />
      <ToastContainer />
    </div>
  );
}

export default App;
