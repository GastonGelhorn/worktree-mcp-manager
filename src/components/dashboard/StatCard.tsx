import { Card } from '../ui/Card';
import { cn } from '../../lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: 'indigo' | 'sky' | 'amber' | 'emerald' | 'purple' | 'red';
}

const colorMap = {
  indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  sky: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  red: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
};

export function StatCard({ label, value, icon, color = 'indigo' }: StatCardProps) {
  const c = colorMap[color];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', c.bg, c.text)}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-semibold text-white/90 tracking-tight">{value}</div>
      <div className="text-xs text-white/40 mt-0.5">{label}</div>
    </Card>
  );
}
