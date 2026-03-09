import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../stores/app-store';
import { cn } from '../../lib/utils';

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const styles = {
  success: 'border-emerald-500/30 bg-emerald-500/10',
  error: 'border-red-500/30 bg-red-500/10',
  info: 'border-sky-500/30 bg-sky-500/10',
  warning: 'border-amber-500/30 bg-amber-500/10',
};

const iconStyles = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  info: 'text-sky-400',
  warning: 'text-amber-400',
};

export function ToastContainer() {
  const toasts = useAppStore(s => s.toasts);
  const removeToast = useAppStore(s => s.removeToast);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <AnimatePresence mode="popLayout">
        {toasts.slice(-3).map(toast => {
          const Icon = icons[toast.type];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border backdrop-blur-xl shadow-xl',
                styles[toast.type],
              )}
            >
              <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', iconStyles[toast.type])} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/90">{toast.title}</p>
                {toast.description && (
                  <p className="text-xs text-white/50 mt-0.5 break-words line-clamp-6">{toast.description}</p>
                )}
              </div>
              <button onClick={() => removeToast(toast.id)} className="text-white/30 hover:text-white/60 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
