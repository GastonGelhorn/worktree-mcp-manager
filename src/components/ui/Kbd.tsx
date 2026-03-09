import { cn } from '../../lib/utils';

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded',
        'bg-white/10 border border-white/10 text-[10px] text-white/50 font-mono',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
