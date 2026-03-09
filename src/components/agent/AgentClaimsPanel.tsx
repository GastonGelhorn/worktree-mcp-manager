import { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { RefreshCw, Clock, Monitor, Shield } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface SessionClaim {
  sessionId: string;
  ide: string;
  claimedAt: number;
  heartbeatAt: number;
}

interface SessionClaimWithPath extends SessionClaim {
  wtPath: string;
}

export function AgentClaimsPanel() {
  const [claims, setClaims] = useState<SessionClaimWithPath[]>([]);
  const [loading, setLoading] = useState(false);

  const loadClaims = async () => {
    setLoading(true);
    try {
      const raw: string = await invoke('read_mcp_session_claims');
      const parsed = JSON.parse(raw) as Record<string, SessionClaim>;

      // Clean up stale claims (>3 min old)
      const now = Date.now();
      const STALE_MS = 3 * 60 * 1000;

      const activeClaims = Object.entries(parsed)
        .filter(([, claim]) => now - claim.heartbeatAt < STALE_MS)
        .map(([wtPath, claim]) => ({ ...claim, wtPath }));

      setClaims(activeClaims);
    } catch {
      setClaims([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClaims();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadClaims, 30_000);
    return () => clearInterval(interval);
  }, []);

  const getAgeText = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  if (claims.length === 0) {
    return (
      <div className="space-y-6">
        {/* Status card */}
        <div className="flex flex-col items-center justify-center py-12 px-4 rounded-lg border border-white/5 bg-white/2">
          <Shield className="w-12 h-12 text-emerald-400/40 mb-3" />
          <p className="text-sm font-medium text-white/60 text-center mb-1">Worktree Protection Active</p>
          <p className="text-xs text-white/30 text-center max-w-sm">
            No worktrees are currently locked. When an AI agent starts modifying a worktree
            via MCP, it's automatically locked to prevent another agent in a different IDE
            from editing the same files simultaneously.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadClaims}
            disabled={loading}
            className="mt-3"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* How it works */}
        <div className="rounded-lg border border-white/5 bg-white/2 p-4">
          <h4 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">How it works</h4>
          <div className="space-y-3 text-xs text-white/40">
            <div className="flex gap-2">
              <span className="text-emerald-400 shrink-0">1.</span>
              <span>Agent A (e.g., Claude Code) starts editing a worktree → lock is acquired automatically</span>
            </div>
            <div className="flex gap-2">
              <span className="text-amber-400 shrink-0">2.</span>
              <span>Agent B (e.g., Cursor) tries to edit the same worktree → gets blocked with a suggestion to create a new worktree</span>
            </div>
            <div className="flex gap-2">
              <span className="text-blue-400 shrink-0">3.</span>
              <span>When the MCP session ends, the lock is released automatically</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium text-white/80">Active Worktree Locks</h3>
          <p className="text-[10px] text-white/30 mt-0.5">
            {claims.length} worktree{claims.length !== 1 ? 's' : ''} currently locked by AI agents
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadClaims}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="space-y-2">
        {claims.map((claim) => {
          const wtName = claim.wtPath.split('/').pop() || claim.wtPath;
          const isRecent = Date.now() - claim.heartbeatAt < 60_000;

          return (
            <div
              key={claim.wtPath}
              className="rounded-lg border bg-white/2 border-white/5 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Worktree name */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`w-2 h-2 rounded-full ${isRecent ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                    <span className="text-sm font-medium text-white/90 font-mono truncate">
                      {wtName}
                    </span>
                  </div>

                  {/* IDE + Session */}
                  <div className="flex items-center gap-2 mb-1">
                    <Monitor className="w-3 h-3 text-white/30" />
                    <span className="text-xs text-white/60">{claim.ide}</span>
                    <span className="text-[10px] text-white/20 font-mono">{claim.sessionId}</span>
                  </div>

                  {/* Timing */}
                  <div className="flex items-center gap-4 text-[10px] text-white/30">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Locked {getAgeText(claim.claimedAt)}</span>
                    </div>
                    <span>Last activity: {getAgeText(claim.heartbeatAt)}</span>
                  </div>

                  {/* Path */}
                  <div className="mt-1.5 text-[10px] text-white/20 font-mono truncate" title={claim.wtPath}>
                    {claim.wtPath}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10 flex gap-2">
        <Shield className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-400/70">
          Locks are released automatically when the agent's MCP session ends.
          Stale locks (inactive &gt;3 min) are cleaned up automatically.
        </p>
      </div>
    </div>
  );
}
