import { useState, useEffect, useRef } from 'react';
import { FileEdit, FilePlus, FileX, FileQuestion, Loader2, Sparkles } from 'lucide-react';
import * as cmd from '../../lib/tauri-commands';
import { useAppStore } from '../../stores/app-store';
import { cn } from '../../lib/utils';

interface ParsedFile {
  path: string;
  indexCode: string; // staged state: ' ', 'M', 'A', 'D', 'R', 'C', '?'
  worktreeCode: string;
  staged: boolean;
}

function parseStatus(status: string): ParsedFile[] {
  return status
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length >= 3)
    .map(line => {
      const indexCode = line[0] ?? ' ';
      const worktreeCode = line[1] ?? ' ';
      const path = line.slice(2).trim();
      const staged = indexCode !== ' ' && indexCode !== '?';
      return { path, indexCode, worktreeCode, staged };
    });
}

/** Build a short commit message suggestion from staged files (paths and status). */
function suggestCommitMessage(files: ParsedFile[], getStaged: (f: ParsedFile) => boolean): string {
  const staged = files.filter(f => getStaged(f));
  if (staged.length === 0) return '';
  const hasNew = staged.some(f => f.indexCode === 'A' || f.indexCode === '?');
  const hasDelete = staged.some(f => f.indexCode === 'D');
  const prefix = hasNew && !hasDelete ? 'feat: ' : hasDelete && staged.length <= 2 ? 'chore: remove ' : 'fix: ';
  const names = staged.slice(0, 3).map(f => {
    const base = f.path.split('/').pop() ?? f.path;
    const noExt = base.replace(/\.[a-z0-9]+$/i, '');
    return noExt.replace(/[-_.]/g, ' ');
  });
  const phrase = names.length === 1 ? names[0]! : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  if (hasDelete && staged.length === 1) return prefix + phrase;
  if (hasDelete) return prefix + 'obsolete files';
  return prefix + phrase;
}

/** One row of unified diff: line numbers for HEAD (left) and working tree (right), and the line content. */
interface DiffLine {
  leftNum: number | null;
  rightNum: number | null;
  type: 'context' | 'remove' | 'add';
  line: string;
}

/** Computes unified diff with line numbers from HEAD (old) and working tree (new) content. */
function computeUnifiedDiff(oldText: string | null, newText: string | null): DiffLine[] {
  const oldLines = (oldText ?? '').split(/\r?\n/);
  const newLines = (newText ?? '').split(/\r?\n/);
  const n = oldLines.length;
  const m = newLines.length;

  // LCS length: dp[i][j] = LCS of oldLines[0..i], newLines[0..j]
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = 1 + dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const out: DiffLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      out.push({ leftNum: i, rightNum: j, type: 'context', line: oldLines[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      out.push({ leftNum: null, rightNum: j, type: 'add', line: newLines[j - 1]! });
      j--;
    } else {
      out.push({ leftNum: i, rightNum: null, type: 'remove', line: oldLines[i - 1]! });
      i--;
    }
  }
  return out.reverse();
}

const statusConfig: Record<string, { icon: typeof FileEdit; color: string }> = {
  M: { icon: FileEdit, color: 'text-amber-400' },
  A: { icon: FilePlus, color: 'text-green-400' },
  D: { icon: FileX, color: 'text-red-400' },
  '?': { icon: FileQuestion, color: 'text-blue-400' },
  R: { icon: FileEdit, color: 'text-purple-400' },
  C: { icon: FilePlus, color: 'text-cyan-400' },
};

function getIcon(code: string) {
  const c = code === '?' ? '?' : code.trim() || 'M';
  return statusConfig[c] || statusConfig['M']!;
}

interface WorktreeExpandableFilesProps {
  wtPath: string;
  status: string;
  onRefresh: () => void;
  className?: string;
}

export function WorktreeExpandableFiles({ wtPath, status, onRefresh, className }: WorktreeExpandableFilesProps) {
  const addToast = useAppStore(s => s.addToast);
  const [staging, setStaging] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [pullFirst, setPullFirst] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [optimisticStaged, setOptimisticStaged] = useState<Record<string, boolean>>({});

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [diffSides, setDiffSides] = useState<[string | null, string | null] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const prevStatusRef = useRef<string>(status);

  useEffect(() => {
    if (!selectedPath) {
      setDiffSides(null);
      return;
    }
    let cancelled = false;
    setDiffLoading(true);
    cmd.getFileDiffSides(wtPath, selectedPath).then(
      sides => {
        if (!cancelled) setDiffSides(sides);
      },
      () => {
        if (!cancelled) setDiffSides(null);
      }
    ).finally(() => {
      if (!cancelled) setDiffLoading(false);
    });
    return () => { cancelled = true; };
  }, [wtPath, selectedPath]);

  useEffect(() => {
    if (status !== prevStatusRef.current) {
      prevStatusRef.current = status;
      setOptimisticStaged(prev => {
        const next = { ...prev };
        const files = parseStatus(status);
        files.forEach(f => delete next[f.path]);
        return next;
      });
    }
  }, [status]);

  if (!status || !status.trim()) {
    return (
      <div className="border-t border-white/5 pt-3 px-4 pb-3 text-xs text-white/30">
        No modified or untracked files.
      </div>
    );
  }

  const files = parseStatus(status);

  const getStaged = (file: ParsedFile) =>
    file.path in optimisticStaged ? optimisticStaged[file.path] : file.staged;

  const handleToggleStaged = async (file: ParsedFile) => {
    if (staging) return;
    const nextStaged = !getStaged(file);
    setOptimisticStaged(prev => ({ ...prev, [file.path]: nextStaged }));
    setStaging(file.path);
    try {
      if (nextStaged) {
        await cmd.stageFiles(wtPath, [file.path]);
        addToast('success', 'Staged', file.path);
      } else {
        await cmd.unstageFiles(wtPath, [file.path]);
        addToast('success', 'Unstaged', file.path);
      }
      onRefresh();
    } catch (e: unknown) {
      addToast('error', 'Failed', e instanceof Error ? e.message : String(e));
      setOptimisticStaged(prev => ({ ...prev, [file.path]: file.staged }));
    } finally {
      setStaging(null);
    }
  };

  const handleCommit = async () => {
    const msg = commitMessage.trim();
    if (!msg) {
      addToast('warning', 'Enter a commit message');
      return;
    }
    if (committing) return;
    setCommitting(true);
    try {
      const freshStatus = await cmd.getChanges(wtPath);
      const freshFiles = parseStatus(freshStatus);
      const stagedPaths = freshFiles
        .filter(f => f.indexCode !== ' ' && f.indexCode !== '?')
        .map(f => f.path);
      if (stagedPaths.length === 0) {
        addToast(
          'error',
          'Nothing to commit',
          'Git reports no staged files. Click Refresh to sync the list, then stage the files you want and commit again.'
        );
        await onRefresh();
        return;
      }
      if (pullFirst) {
        await cmd.pull(wtPath);
        addToast('success', 'Pulled');
      }
      await cmd.stageFiles(wtPath, stagedPaths);
      await cmd.commit(wtPath, msg);
      addToast('success', 'Committed', msg);
      setCommitMessage('');
      await onRefresh();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      addToast('error', 'Commit failed', errMsg);
    } finally {
      setCommitting(false);
    }
  };

  const stagedCount = files.filter(f => getStaged(f)).length;

  const MAX_DIFF_LINES = 1000;
  const rawDiff = diffSides ? computeUnifiedDiff(diffSides[0], diffSides[1]) : [];
  const unifiedLines =
    rawDiff.length <= MAX_DIFF_LINES ? rawDiff : rawDiff.slice(0, MAX_DIFF_LINES);
  const truncated = rawDiff.length > MAX_DIFF_LINES;

  return (
    <div className={cn('relative flex flex-col lg:flex-row min-h-0 border-t border-white/5 pt-3 pb-3', className)}>
      {committing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            <span className="text-sm font-medium text-white/80">Committing...</span>
          </div>
        </div>
      )}
      {/* Left: file list + commit */}
      <div className="flex flex-col min-h-0 lg:w-[28%] lg:min-w-[240px] lg:max-w-[400px] shrink-0">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">Files</span>
          <span className="text-[11px] text-white/30">
            {stagedCount} staged · {files.length - stagedCount} unstaged
          </span>
        </div>
        <div className="space-y-0.5 flex-1 min-h-0 overflow-auto mb-3">
          {files.map((f, i) => {
            const staged = getStaged(f);
            const { icon: Icon, color } = getIcon(staged ? f.indexCode : f.worktreeCode);
            const busy = staging === f.path;
            const isSelected = selectedPath === f.path;
            return (
              <div
                key={`${f.path}-${i}`}
                className={cn(
                  'flex items-center gap-2 py-1 px-1.5 rounded hover:bg-white/[0.04]',
                  busy && 'opacity-60',
                  isSelected && 'bg-white/5 ring-1 ring-white/10'
                )}
              >
                <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={staged}
                    disabled={busy}
                    onChange={() => handleToggleStaged(f)}
                    onClick={e => e.stopPropagation()}
                    className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/50"
                  />
                  {busy ? (
                    <Loader2 className="w-3 h-3 animate-spin text-white/40" />
                  ) : (
                    <Icon className={cn('w-3 h-3', color)} />
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setSelectedPath(p => (p === f.path ? null : f.path))}
                  className="font-mono text-xs text-white/70 truncate flex-1 text-left min-w-0 hover:text-white/90"
                  title={f.path}
                >
                  {f.path}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <div className="flex gap-1.5">
            <input
              type="text"
              value={commitMessage}
              onChange={e => setCommitMessage(e.target.value)}
              placeholder="Commit message"
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/90 placeholder:text-white/30 focus:outline-none focus:border-indigo-500/50"
            />
            <button
              type="button"
              onClick={() => setCommitMessage(suggestCommitMessage(files, getStaged))}
              disabled={stagedCount === 0}
              title="Suggest message from file names"
              className="shrink-0 p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-indigo-400 hover:bg-white/10 hover:border-white/20 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-white/50 cursor-pointer">
              <input
                type="checkbox"
                checked={pullFirst}
                onChange={e => setPullFirst(e.target.checked)}
                className="rounded border-white/20 bg-white/5 text-indigo-500"
              />
              Pull before commit
            </label>
            <button
              type="button"
              onClick={handleCommit}
              disabled={committing || stagedCount === 0}
              className="px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-medium hover:bg-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {committing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Commit
            </button>
          </div>
        </div>
      </div>

      {/* Right: unified diff (HEAD + working tree in one column with line numbers) */}
      <div className="flex-1 min-h-0 flex flex-col border border-white/10 rounded-lg overflow-hidden bg-black/20 lg:ml-4">
        <div className="flex items-center justify-between border-b border-white/10 text-[11px] font-medium text-white/50 shrink-0 px-2 py-1.5">
          <span className="font-mono truncate" title={selectedPath ?? ''}>
            {selectedPath ?? '—'}
          </span>
          {selectedPath && unifiedLines.length > 0 && (
            <span className="text-white/40 shrink-0 ml-2">
              Hunk 1: Lines 1–{unifiedLines.length}
            </span>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {!selectedPath ? (
            <div className="flex items-center justify-center py-8 text-xs text-white/30">
              Select a file to view diff
            </div>
          ) : diffLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-white/40" />
            </div>
          ) : diffSides && unifiedLines.length > 0 ? (
            <div className="p-2 text-[11px] font-mono min-h-full">
              {unifiedLines.map((row, idx) => {
                const prefix =
                  row.type === 'remove' ? '-' : row.type === 'add' ? '+' : ' ';
                const leftStr = row.leftNum != null ? String(row.leftNum) : '';
                const rightStr = row.rightNum != null ? String(row.rightNum) : '';
                const bg =
                  row.type === 'remove'
                    ? 'bg-red-950/30 text-red-200/90'
                    : row.type === 'add'
                      ? 'bg-emerald-950/30 text-emerald-200/90'
                      : 'text-white/70';
                return (
                  <div
                    key={idx}
                    className={cn(
                      'flex gap-3 py-0.5 leading-relaxed whitespace-pre-wrap break-words',
                      bg
                    )}
                  >
                    <span className="w-8 shrink-0 text-right tabular-nums text-white/40 select-none">
                      {leftStr}
                    </span>
                    <span className="w-8 shrink-0 text-right tabular-nums text-white/40 select-none">
                      {rightStr}
                    </span>
                    <span className="w-4 shrink-0 text-white/50">{prefix}</span>
                    <span className="min-w-0 flex-1">{row.line || ' '}</span>
                  </div>
                );
              })}
              {truncated && (
                <div className="py-2 text-white/40 text-xs">... truncated</div>
              )}
            </div>
          ) : diffSides && (diffSides[0] == null || diffSides[1] == null) ? (
            <div className="p-2 text-[11px] font-mono text-white/50">
              {diffSides[0] == null ? '(new file)' : '(deleted)'}
            </div>
          ) : !diffSides ? (
            <div className="flex items-center justify-center py-8 text-xs text-white/30">
              Could not load content
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-xs text-white/30">
              No changes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
