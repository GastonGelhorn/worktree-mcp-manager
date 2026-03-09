import { useState } from 'react';
import { Puzzle, Copy, Check, Terminal, FileJson, Wand2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useAppStore } from '../../stores/app-store';
import { cn } from '../../lib/utils';
import * as cmd from '../../lib/tauri-commands';
import type { IdeSetupResult } from '../../lib/tauri-commands';

function CodeBlock({ title, icon, code }: {
  title: string;
  icon: React.ReactNode;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  const addToast = useAppStore(s => s.addToast);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      addToast('success', 'Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('error', 'Failed to copy');
    }
  };

  return (
    <div className="rounded-xl border border-white/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.02] border-b border-white/5">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium text-white/60">{title}</span>
        </div>
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
            copied
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-white/5 text-white/40 hover:text-white/70 hover:bg-white/10'
          )}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-xs font-mono text-white/70 overflow-x-auto leading-relaxed bg-surface-0/50">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const cursorConfig = `// .cursor/mcp.json (project-local)
{
  "mcpServers": {
    "worktree-mcp": {
      "command": "node",
      "args": ["/Users/YOU/code/worktree/mcp-server/index.js"],
      "env": {
        "WORKTREE_CLI_PATH": "/Users/YOU/code/worktree/target/release/worktree-cli"
      }
    }
  }
}`;

const claudeCodeCommand = `# Project-local (from project root):
claude mcp add -s project -e WORKTREE_CLI_PATH=/Users/YOU/code/worktree/target/release/worktree-cli worktree-mcp -- node mcp-server/index.js

# Global (any project):
claude mcp add -s user -e WORKTREE_CLI_PATH=/Users/YOU/code/worktree/target/release/worktree-cli worktree-mcp -- node /Users/YOU/code/worktree/mcp-server/index.js`;

const vsCodeConfig = `// .vscode/settings.json
{
  "mcp": {
    "servers": {
      "worktree-mcp": {
        "command": "node",
        "args": ["/Users/YOU/code/worktree/mcp-server/index.js"],
        "env": {
          "WORKTREE_CLI_PATH": "/Users/YOU/code/worktree/target/release/worktree-cli"
        }
      }
    }
  }
}`;

export function McpIntegration() {
  const activeRepo = useAppStore(s => s.activeRepo);
  const addToast = useAppStore(s => s.addToast);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupResults, setSetupResults] = useState<IdeSetupResult[] | null>(null);

  const handleSetupAll = async () => {
    if (!activeRepo) {
      addToast('error', 'No active repository selected');
      return;
    }
    setSetupLoading(true);
    setSetupResults(null);
    try {
      const results = await cmd.setupAllIdes(activeRepo);
      setSetupResults(results);
      const successCount = results.filter(r => r.success).length;
      addToast('success', `Configured ${successCount}/${results.length} IDEs`);
    } catch (e) {
      addToast('error', `Setup failed: ${e}`);
    } finally {
      setSetupLoading(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-lg bg-indigo-500/10">
          <Puzzle className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">MCP Integration</span>
      </div>

      <p className="text-xs text-white/40 leading-relaxed mb-5">
        Connect Worktree MCP Manager to your IDE or AI assistant via the
        Model Context Protocol (MCP). This allows tools like Cursor, VS Code, and
        Claude Code to interact with your worktrees directly.
      </p>

      {/* Auto-setup button */}
      <div className="mb-5 p-4 rounded-xl border border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="text-xs font-semibold text-white/80">Auto-Setup All IDEs</h4>
            <p className="text-[11px] text-white/40 mt-0.5">
              Detect and configure MCP for Cursor, VS Code, and Claude CLI automatically.
            </p>
          </div>
          <button
            onClick={handleSetupAll}
            disabled={setupLoading || !activeRepo}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              setupLoading
                ? 'bg-white/5 text-white/30 cursor-wait'
                : 'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25'
            )}
          >
            {setupLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            {setupLoading ? 'Setting up...' : 'Setup All'}
          </button>
        </div>

        {setupResults && (
          <div className="mt-3 space-y-1.5">
            {setupResults.map((r, i) => (
              <div key={i} className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
                r.success ? 'bg-emerald-500/5 text-emerald-400/80' : 'bg-red-500/5 text-red-400/80'
              )}>
                {r.success ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                <span className="font-medium">{r.ide}</span>
                <span className="text-white/30 truncate">{r.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <CodeBlock
          title="Cursor — .cursor/mcp.json"
          icon={<FileJson className="w-3.5 h-3.5 text-cyan-400" />}
          code={cursorConfig}
        />

        <CodeBlock
          title="VS Code — settings.json"
          icon={<FileJson className="w-3.5 h-3.5 text-sky-400" />}
          code={vsCodeConfig}
        />

        <CodeBlock
          title="Claude Code — Terminal"
          icon={<Terminal className="w-3.5 h-3.5 text-amber-400" />}
          code={claudeCodeCommand}
        />
      </div>

      <div className="mt-5 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
        <p className="text-xs text-amber-400/70 leading-relaxed">
          <span className="font-semibold text-amber-400">Note:</span> MCP server support requires the Worktree MCP Manager binary to be available in your PATH. Make sure to build and install the app first.
        </p>
      </div>
    </div>
  );
}
