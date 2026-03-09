import { cn } from '../../lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, hover = false, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white/[0.03] border border-white/[0.06] rounded-xl backdrop-blur-sm',
        'transition-all duration-300',
        hover && 'hover:bg-white/[0.06] hover:border-white/[0.1] hover:shadow-lg hover:shadow-black/20 cursor-pointer',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}
