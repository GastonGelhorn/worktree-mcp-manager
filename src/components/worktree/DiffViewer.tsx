import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, FileEdit, FilePlus, FileX, FileQuestion } from 'lucide-react';

interface DiffViewerProps {
  status?: string;
}

interface FileChange {
  code: string;
  file: string;
}

function parseStatus(status: string): FileChange[] {
  return status
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length >= 3)
    .map(line => ({
      code: line.substring(0, 2).trim(),
      file: line.substring(2).trim(),
    }));
}

const statusConfig: Record<string, { icon: typeof FileEdit; color: string; label: string }> = {
  M: { icon: FileEdit, color: 'text-amber-400', label: 'Modified' },
  A: { icon: FilePlus, color: 'text-green-400', label: 'Added' },
  D: { icon: FileX, color: 'text-red-400', label: 'Deleted' },
  '??': { icon: FileQuestion, color: 'text-blue-400', label: 'Untracked' },
  R: { icon: FileEdit, color: 'text-purple-400', label: 'Renamed' },
  C: { icon: FilePlus, color: 'text-cyan-400', label: 'Copied' },
};

function getConfig(code: string) {
  return statusConfig[code] || statusConfig['M']!;
}

export function DiffViewer({ status }: DiffViewerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!status || !status.trim()) return null;

  const files = parseStatus(status);
  if (files.length === 0) return null;

  return (
    <div className="border-t border-white/5 pt-2 mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/60 transition-colors w-full"
      >
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="w-3 h-3" />
        </motion.div>
        <span>{files.length} changed file{files.length !== 1 ? 's' : ''}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 space-y-0.5 max-h-32 overflow-auto">
              {files.map((f, i) => {
                const cfg = getConfig(f.code);
                const Icon = cfg.icon;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 text-[11px] py-0.5 px-1 rounded hover:bg-white/[0.02]"
                    title={`${cfg.label}: ${f.file}`}
                  >
                    <Icon className={`w-3 h-3 shrink-0 ${cfg.color}`} />
                    <span className="font-mono text-white/50 truncate">{f.file}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
