import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from '../ui/Badge';
import { parseGitStatus } from '../../lib/utils';

interface WorktreeStatusBadgeProps {
  status?: string;
  isDetached?: boolean;
}

export function WorktreeStatusBadge({ status, isDetached }: WorktreeStatusBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showTooltip && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    }
  }, [showTooltip]);

  if (isDetached) {
    return <Badge variant="warning" dot>Detached HEAD</Badge>;
  }

  if (!status || status.trim() === '') {
    return (
      <Badge variant="success" dot>Clean</Badge>
    );
  }

  const parsed = parseGitStatus(status);
  const total = parsed.added + parsed.modified + parsed.deleted + parsed.untracked;

  if (total === 0) {
    return <Badge variant="success" dot>Clean</Badge>;
  }

  const parts: string[] = [];
  if (parsed.modified > 0) parts.push(`${parsed.modified}M`);
  if (parsed.added > 0) parts.push(`${parsed.added}A`);
  if (parsed.deleted > 0) parts.push(`${parsed.deleted}D`);
  if (parsed.untracked > 0) parts.push(`${parsed.untracked}U`);

  // Verbose descriptions for tooltip
  const tooltipLines: string[] = [];
  if (parsed.modified > 0) tooltipLines.push(`${parsed.modified} modified`);
  if (parsed.added > 0) tooltipLines.push(`${parsed.added} added`);
  if (parsed.deleted > 0) tooltipLines.push(`${parsed.deleted} deleted`);
  if (parsed.untracked > 0) tooltipLines.push(`${parsed.untracked} untracked`);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <Badge variant="warning" dot>
        {parts.join(' ')}
      </Badge>

      {showTooltip && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="mb-2">
            <div className="bg-gray-900/95 border border-gray-700 rounded-lg px-3 py-2 shadow-xl backdrop-blur-sm whitespace-nowrap">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">
                Working Tree Changes
              </p>
              {tooltipLines.map(line => (
                <p key={line} className="text-xs text-gray-200 leading-relaxed flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    line.includes('modified') ? 'bg-amber-400' :
                    line.includes('added') ? 'bg-green-400' :
                    line.includes('deleted') ? 'bg-red-400' :
                    'bg-blue-400'
                  }`} />
                  {line}
                </p>
              ))}
              <p className="text-[10px] text-gray-500 mt-1.5 pt-1.5 border-t border-gray-700/50">
                {total} file{total !== 1 ? 's' : ''} with changes
              </p>
            </div>
            {/* Arrow */}
            <div className="w-2 h-2 bg-gray-900/95 border-b border-r border-gray-700 rotate-45 mx-auto -mt-1" />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
