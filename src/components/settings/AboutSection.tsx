import { GitBranch, Heart, ExternalLink } from 'lucide-react';

export function AboutSection() {
  return (
    <div className="space-y-1">
      {/* Logo area */}
      <div className="flex flex-col items-center text-center py-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4">
          <GitBranch className="w-7 h-7 text-indigo-400" />
        </div>
        <h3 className="text-base font-semibold text-white/90">Worktree MCP Manager</h3>
        <span className="text-xs text-white/30 mt-1">v0.1.0</span>
      </div>

      {/* Tech stack */}
      <div className="rounded-xl border border-white/5 overflow-hidden">
        <div className="px-4 py-2.5 bg-white/[0.02] border-b border-white/5">
          <span className="text-xs font-medium text-white/50">Built with</span>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3">
          {[
            { name: 'Tauri 2', color: 'text-sky-400', bg: 'bg-sky-500/10' },
            { name: 'React 19', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
            { name: 'Rust', color: 'text-orange-400', bg: 'bg-orange-500/10' },
            { name: 'TypeScript', color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { name: 'Zustand', color: 'text-amber-400', bg: 'bg-amber-500/10' },
            { name: 'Framer Motion', color: 'text-purple-400', bg: 'bg-purple-500/10' },
          ].map(tech => (
            <div
              key={tech.name}
              className={`${tech.bg} rounded-lg px-3 py-2 flex items-center justify-center`}
            >
              <span className={`text-xs font-medium ${tech.color}`}>{tech.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Links */}
      <div className="mt-4 space-y-1">
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between px-4 py-2.5 rounded-xl hover:bg-white/[0.02] transition-colors group"
        >
          <span className="text-sm text-white/50 group-hover:text-white/70">Source code</span>
          <ExternalLink className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40" />
        </a>
        <a
          href="https://github.com/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between px-4 py-2.5 rounded-xl hover:bg-white/[0.02] transition-colors group"
        >
          <span className="text-sm text-white/50 group-hover:text-white/70">Report an issue</span>
          <ExternalLink className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40" />
        </a>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-white/5 flex items-center justify-center gap-1.5 text-xs text-white/20">
        <span>Made with</span>
        <Heart className="w-3 h-3 text-red-400/50" />
        <span>by Square1</span>
      </div>
    </div>
  );
}
