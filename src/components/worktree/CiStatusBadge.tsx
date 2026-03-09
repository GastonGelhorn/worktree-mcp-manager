import { CheckCircle2, XCircle, Loader2, Clock, Circle } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import type { CiStatus } from '../../types/new-types';

interface CiStatusBadgeProps {
  status: CiStatus;
  url?: string;
  provider?: string;
}

export function CiStatusBadge({ status, url, provider }: CiStatusBadgeProps) {
  // Don't render anything when there's no CI configured
  if (status === 'None') return null;
  const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
    Passed: {
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      label: 'Passed',
    },
    Failed: {
      icon: XCircle,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      label: 'Failed',
    },
    Running: {
      icon: Loader2,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      label: 'Running',
    },
    Pending: {
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      label: 'Pending',
    },
    None: {
      icon: Circle,
      color: 'text-white/30',
      bg: 'bg-white/5',
      label: 'No CI',
    },
  };

  const config = statusConfig[status] ?? statusConfig['None'];
  const Icon = config.icon;

  const handleClick = async () => {
    if (url) {
      try {
        await open(url);
      } catch (e) {
        console.error('Failed to open CI URL:', e);
      }
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={!url}
      title={`CI Status: ${config.label}${provider ? ` (${provider})` : ''}${url ? ' - Click to open' : ''}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-white/10 transition-all ${config.bg} hover:border-white/20 ${url ? 'cursor-pointer' : 'cursor-default'} ${url ? 'hover:bg-opacity-80' : ''}`}
    >
      <Icon
        className={`w-3.5 h-3.5 ${config.color} ${status === 'Running' ? 'animate-spin' : ''}`}
      />
      <span className={config.color}>{config.label}</span>
    </button>
  );
}
