import { Keyboard } from 'lucide-react';
import { Kbd } from '../ui/Kbd';

interface ShortcutEntry {
  keys: string[];
  description: string;
  category: string;
}

const shortcuts: ShortcutEntry[] = [
  { keys: ['⌘', 'K'], description: 'Open command palette', category: 'General' },
  { keys: ['⌘', ','], description: 'Open settings', category: 'General' },
  { keys: ['⌘', 'R'], description: 'Refresh data', category: 'General' },
  { keys: ['⌘', '1'], description: 'Grid view', category: 'Views' },
  { keys: ['⌘', '2'], description: 'List view', category: 'Views' },
  { keys: ['⌘', '3'], description: 'Table view', category: 'Views' },
  { keys: ['Esc'], description: 'Close dialog / palette', category: 'Navigation' },
];

export function KeyboardShortcuts() {
  const categories = [...new Set(shortcuts.map(s => s.category))];

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-lg bg-indigo-500/10">
          <Keyboard className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Keyboard Shortcuts</span>
      </div>

      <p className="text-xs text-white/30 mb-4">
        On Windows/Linux, use Ctrl instead of ⌘.
      </p>

      <div className="space-y-5">
        {categories.map(category => (
          <div key={category}>
            <div className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-2">
              {category}
            </div>
            <div className="space-y-0.5">
              {shortcuts
                .filter(s => s.category === category)
                .map(shortcut => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="text-sm text-white/60">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <Kbd key={i}>{key}</Kbd>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
