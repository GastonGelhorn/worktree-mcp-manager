import { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import * as cmd from '../../lib/tauri-commands';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Sparkles, Trash2, MoreHorizontal, Copy, FolderOpen, FileText, GitMerge } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { WorktreeEnriched } from '../../types';

interface WorktreeActionsProps {
  worktree: WorktreeEnriched;
  onRequestDelete?: () => void;
}

export function WorktreeActions({ worktree, onRequestDelete }: WorktreeActionsProps) {
  const addToast = useAppStore(s => s.addToast);

  const [confirmAI, setConfirmAI] = useState(false);
  const [confirmClaude, setConfirmClaude] = useState(false);
  const [confirmMergeCleanup, setConfirmMergeCleanup] = useState(false);
  const [targetBranch, setTargetBranch] = useState('main');

  const branchName = worktree.branch?.replace('refs/heads/', '') || '';
  const mergeAndCleanup = useAppStore(s => s.mergeAndCleanup);

  const handleInjectAI = async () => {
    try {
      await cmd.injectPrompt(worktree.path, branchName, '');
      addToast('success', 'AI context injected', '.cursorrules created');
    } catch (e: any) {
      addToast('error', 'Failed to inject AI context', e.toString());
    }
  };

  const handleInjectClaude = async () => {
    try {
      await cmd.injectClaudeContext(worktree.path, branchName, '');
      addToast('success', 'CLAUDE.md generated', 'Rich context with diff stats');
    } catch (e: any) {
      addToast('error', 'Failed to generate CLAUDE.md', e.toString());
    }
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(worktree.path);
    addToast('info', 'Path copied to clipboard');
  };

  const handleMergeAndCleanup = async () => {
    if (!targetBranch.trim()) {
      addToast('warning', 'Target branch required', 'Please provide a target branch to merge into.');
      return;
    }
    await mergeAndCleanup(worktree.path, branchName, targetBranch.trim());
    setConfirmMergeCleanup(false);
  };

  const handleOpenFolder = async () => {
    try {
      await cmd.openInCursor(worktree.path);
      addToast('success', 'Abriendo Cursor en nueva ventana');
    } catch (e: unknown) {
      addToast('error', 'No se pudo abrir en Cursor', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={handleOpenFolder} title="Open folder">
          <FolderOpen className="w-3.5 h-3.5" />
        </Button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[180px] bg-surface-3 border border-white/10 rounded-lg p-1 shadow-xl shadow-black/40 animate-slide-down z-50"
              sideOffset={4}
              align="end"
            >
              <DropdownMenu.Item
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/5 rounded-md cursor-pointer outline-none"
                onClick={handleCopyPath}
              >
                <Copy className="w-3.5 h-3.5" /> Copy Path
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/5 rounded-md cursor-pointer outline-none"
                onClick={() => setConfirmAI(true)}
              >
                <Sparkles className="w-3.5 h-3.5" /> Inject .cursorrules
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/5 rounded-md cursor-pointer outline-none"
                onClick={() => setConfirmClaude(true)}
              >
                <FileText className="w-3.5 h-3.5" /> Generate CLAUDE.md
              </DropdownMenu.Item>
              {onRequestDelete && (
                <>
                  <DropdownMenu.Separator className="h-px bg-white/5 my-1" />
                  <DropdownMenu.Item
                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-md cursor-pointer outline-none"
                    onClick={() => setConfirmMergeCleanup(true)}
                  >
                    <GitMerge className="w-3.5 h-3.5" /> Merge & Cleanup
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md cursor-pointer outline-none"
                    onClick={onRequestDelete}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove Worktree
                  </DropdownMenu.Item>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Confirm: AI Inject (.cursorrules) */}
      <ConfirmDialog
        open={confirmAI}
        onOpenChange={setConfirmAI}
        title="Inject .cursorrules"
        description={`This will create a .cursorrules file in "${worktree.path}" with branch context for AI assistants. Continue?`}
        confirmLabel="Inject"
        variant="default"
        onConfirm={handleInjectAI}
      />

      {/* Confirm: CLAUDE.md */}
      <ConfirmDialog
        open={confirmClaude}
        onOpenChange={setConfirmClaude}
        title="Generate CLAUDE.md"
        description={`This will generate a CLAUDE.md file in "${worktree.path}" with diff stats, changed files, and context for Claude Code. Continue?`}
        confirmLabel="Generate"
        variant="default"
        onConfirm={handleInjectClaude}
      />

      {/* Confirm: Merge & Cleanup */}
      <ConfirmDialog
        open={confirmMergeCleanup}
        onOpenChange={setConfirmMergeCleanup}
        title="Merge & Cleanup"
        description={
          <div className="flex flex-col gap-3 mt-2">
            <p className="text-sm text-white/70">
              This will merge <span className="font-mono text-indigo-400">{branchName}</span> into the target branch, then remove the worktree and delete the feature branch.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-white/50">Target branch</label>
              <input
                type="text"
                value={targetBranch}
                onChange={e => setTargetBranch(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white/90 outline-none focus:border-indigo-500/50"
              />
            </div>
            <p className="text-xs text-amber-500/80">Make sure all your changes are committed or stashed. This cannot be easily undone.</p>
          </div>
        }
        confirmLabel="Merge & Cleanup"
        variant="destructive"
        onConfirm={handleMergeAndCleanup}
      />
    </>
  );
}
