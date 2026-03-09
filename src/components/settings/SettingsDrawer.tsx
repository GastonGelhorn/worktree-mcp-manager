import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings2, Keyboard, Puzzle, Info, FileStack, Zap } from 'lucide-react';
import { useAppStore } from '../../stores/app-store';
import { cn } from '../../lib/utils';
import { GeneralSettings } from './GeneralSettings';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { McpIntegration } from './McpIntegration';
import { AboutSection } from './AboutSection';
import { TemplateManager } from './TemplateManager';
import { HooksManager } from './HooksManager';

type SettingsTab = 'general' | 'shortcuts' | 'templates' | 'mcp' | 'hooks' | 'about';

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <Settings2 className="w-3.5 h-3.5" /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard className="w-3.5 h-3.5" /> },
  { id: 'templates', label: 'Templates', icon: <FileStack className="w-3.5 h-3.5" /> },
  { id: 'mcp', label: 'MCP', icon: <Puzzle className="w-3.5 h-3.5" /> },
  { id: 'hooks', label: 'Hooks', icon: <Zap className="w-3.5 h-3.5" /> },
  { id: 'about', label: 'About', icon: <Info className="w-3.5 h-3.5" /> },
];

export function SettingsDrawer() {
  const open = useAppStore(s => s.settingsOpen);
  const setOpen = useAppStore(s => s.setSettingsOpen);
  const activeRepo = useAppStore(s => s.activeRepo);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={() => setOpen(false)}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-[420px] bg-surface-2 border-l border-white/10 z-50 flex flex-col shadow-2xl shadow-black/50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h2 className="text-sm font-semibold text-white/90">Settings</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-white/40 hover:text-white/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 px-4 pt-3 pb-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    activeTab === tab.id
                      ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
                      : 'text-white/40 hover:text-white/60 hover:bg-white/5 border border-transparent'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  {activeTab === 'general' && <GeneralSettings />}
                  {activeTab === 'shortcuts' && <KeyboardShortcuts />}
                  {activeTab === 'templates' && <TemplateManager />}
                  {activeTab === 'mcp' && <McpIntegration />}
                  {activeTab === 'hooks' && activeRepo && <HooksManager repoPath={activeRepo} />}
                  {activeTab === 'hooks' && !activeRepo && (
                    <div className="text-center py-8 text-white/40 text-sm">
                      Select a repository first to manage hooks.
                    </div>
                  )}
                  {activeTab === 'about' && <AboutSection />}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
