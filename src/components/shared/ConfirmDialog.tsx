import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  variant?: 'danger' | 'default' | 'destructive';
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'default',
  loading: loadingProp = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const loading = loadingProp || internalLoading;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.15 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[#16161a] border border-white/10 rounded-xl p-6 shadow-2xl"
              >
                <div className="flex items-start gap-4">
                  {variant === 'danger' && (
                    <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    </div>
                  )}
                  <div className="flex-1">
                    <Dialog.Title className="text-base font-medium text-white/90">
                      {title}
                    </Dialog.Title>
                    <div className="text-sm text-white/50 mt-1.5">
                      {description}
                    </div>
                  </div>
                  <Dialog.Close asChild>
                    <button className="text-white/30 hover:text-white/60 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="sm">Cancel</Button>
                  </Dialog.Close>
                  <Button
                    variant={(variant === 'danger' || variant === 'destructive') ? 'danger' : 'primary'}
                    size="sm"
                    disabled={loading}
                    onClick={async () => {
                      setInternalLoading(true);
                      try {
                        await onConfirm();
                        onOpenChange(false);
                      } finally {
                        setInternalLoading(false);
                      }
                    }}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        Processing...
                      </>
                    ) : (
                      confirmLabel
                    )}
                  </Button>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
