import { AlertCircle, GitBranch, FileText } from 'lucide-react';
import type { WorktreeStatus } from '../../types/new-types';

interface WorktreeStateBadgeProps {
  status: WorktreeStatus;
  counts?: {
    staged?: number;
    modified?: number;
    untracked?: number;
    conflicted?: number;
  };
}

export function WorktreeStateBadge({ status, counts }: WorktreeStateBadgeProps) {
  const statusConfig = {
    Clean: {
      label: 'Clean',
      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      icon: null,
    },
    Dirty: {
      label: 'Dirty',
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      icon: FileText,
    },
    Conflicts: {
      label: 'Conflicts',
      color: 'bg-red-500/10 text-red-400 border-red-500/20',
      icon: AlertCircle,
    },
    Rebasing: {
      label: 'Rebasing',
      color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      icon: GitBranch,
    },
    Merging: {
      label: 'Merging',
      color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      icon: GitBranch,
    },
    Detached: {
      label: 'Detached',
      color: 'bg-white/5 text-white/60 border-white/10',
      icon: AlertCircle,
    },
  };

  const config = statusConfig[status] ?? statusConfig['Clean'];
  const Icon = config.icon;

  const hasChanges = counts && (counts.staged || counts.modified || counts.untracked || counts.conflicted);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${config.color}`}
      title={
        hasChanges
          ? `${counts?.staged || 0} staged, ${counts?.modified || 0} modified, ${counts?.untracked || 0} untracked${counts?.conflicted ? `, ${counts.conflicted} conflicted` : ''}`
          : status
      }
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      <span>{config.label}</span>
      {hasChanges && (
        <span className="ml-0.5 opacity-70">
          ({counts!.staged || 0}+{counts!.modified || 0}±{counts!.untracked || 0}?)
        </span>
      )}
    </span>
  );
}
