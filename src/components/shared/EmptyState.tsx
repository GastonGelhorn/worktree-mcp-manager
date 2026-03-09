import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4', className)}>
      {icon && <div className="text-white/20 mb-4">{icon}</div>}
      <h3 className="text-sm font-medium text-white/60 mb-1">{title}</h3>
      {description && <p className="text-xs text-white/30 text-center max-w-sm mb-4">{description}</p>}
      {action}
    </div>
  );
}
