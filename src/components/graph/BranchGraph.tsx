import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useAppStore } from '../../stores/app-store';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { GitCommit, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { motion } from 'framer-motion';
import type { GraphCommit } from '../../types';
import { CommitDetailPanel } from './CommitDetailPanel';
import { GraphFilters } from './GraphFilters';
import { parseHash, setHash } from '../../lib/router';
import * as cmd from '../../lib/tauri-commands';

const LANE_COLORS = [
  '#818cf8', // indigo
  '#34d399', // emerald
  '#f472b6', // pink
  '#fbbf24', // amber
  '#22d3ee', // cyan
  '#a78bfa', // violet
  '#fb923c', // orange
  '#4ade80', // green
];

const NODE_RADIUS = 5;
const MERGE_RADIUS = 7;
const LANE_WIDTH = 24;
const ROW_HEIGHT = 40;
const GRAPH_LEFT_PAD = 30;

interface LayoutNode {
  commit: GraphCommit;
  lane: number;
  row: number;
  color: string;
  isMerge: boolean;
  x: number;
  y: number;
}

function computeLayout(commits: GraphCommit[]): LayoutNode[] {
  if (!commits || commits.length === 0) return [];

  const rowMap = new Map<string, number>(commits.map((c, i) => [c.hash, i]));

  const laneAssignments = new Map<string, number>();
  let nextLane = 0;

  const children = new Map<string, string[]>();
  commits.forEach(c => {
    children.set(c.hash, []);
  });
  commits.forEach(c => {
    c.parents.forEach(parentHash => {
      const childList = children.get(parentHash);
      if (childList) childList.push(c.hash);
    });
  });

  commits.forEach(commit => {
    if (laneAssignments.has(commit.hash)) return;

    let lane: number;

    if (commit.branches && commit.branches.length > 0) {
      const primaryBranch = commit.branches[0];
      if (laneAssignments.has(primaryBranch)) {
        lane = laneAssignments.get(primaryBranch)!;
      } else {
        lane = Math.min(nextLane, LANE_COLORS.length - 1);
        nextLane++;
      }
    } else {
      const childList = children.get(commit.hash) || [];
      if (childList.length > 0) {
        const firstChildHash = childList[0];
        if (laneAssignments.has(firstChildHash)) {
          lane = laneAssignments.get(firstChildHash)!;
        } else {
          lane = Math.min(nextLane, LANE_COLORS.length - 1);
          nextLane++;
        }
      } else {
        lane = Math.min(nextLane, LANE_COLORS.length - 1);
        nextLane++;
      }
    }

    laneAssignments.set(commit.hash, lane);
  });

  // Calculate max lane for proper info column offset
  const layout: LayoutNode[] = commits.map(commit => {
    const row = rowMap.get(commit.hash) || 0;
    const lane = laneAssignments.get(commit.hash) || 0;
    const isMerge = commit.parents.length > 1;
    const color = LANE_COLORS[lane % LANE_COLORS.length];
    const x = lane * LANE_WIDTH + GRAPH_LEFT_PAD;
    const y = row * ROW_HEIGHT + 30;

    return { commit, lane, row, color, isMerge, x, y };
  });

  return layout;
}

function generateEdgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

function truncateMessage(message: string, maxLength = 55): string {
  if (message.length <= maxLength) return message;
  return message.substring(0, maxLength - 3) + '...';
}

function truncateBranch(branch: string, maxLength = 18): string {
  const clean = branch.replace('refs/heads/', '').replace('origin/', '');
  if (clean.length <= maxLength) return clean;
  return clean.substring(0, maxLength - 2) + '..';
}

export function BranchGraph() {
  const graphCommits = useAppStore(s => s.graphCommits);
  const graphLoading = useAppStore(s => s.graphLoading);
  const loadGraph = useAppStore(s => s.loadGraph);
  const worktrees = useAppStore(s => s.worktrees);
  const activeRepo = useAppStore(s => s.activeRepo);

  const addToast = useAppStore(s => s.addToast);
  const theme = useAppStore(s => s.theme);
  const isLight = theme === 'light';

  const [hoveredHash, setHoveredHash] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<GraphCommit | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [authorFilter, setAuthorFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-refresh when activeRepo changes
  useEffect(() => {
    if (activeRepo) {
      loadGraph();
    }
  }, [activeRepo, loadGraph]);

  // Restore selected commit from hash route
  useEffect(() => {
    const route = parseHash();
    if (route.tab === 'graph' && route.params?.commit && graphCommits.length > 0) {
      const found = graphCommits.find(c => c.short_hash === route.params!.commit || c.hash.startsWith(route.params!.commit));
      if (found) setSelectedCommit(found);
    }
  }, [graphCommits]);

  const worktreeBranches = useMemo(() => {
    const s = new Set<string>();
    for (const wt of worktrees) {
      if (wt.branch) {
        s.add(wt.branch.replace('refs/heads/', ''));
      }
    }
    return s;
  }, [worktrees]);

  // Filtered commits
  const filteredCommits = useMemo(() => {
    if (!authorFilter && !branchFilter) return graphCommits;
    return graphCommits.filter(c => {
      if (authorFilter && !c.author.toLowerCase().includes(authorFilter.toLowerCase())) return false;
      if (branchFilter && !c.branches?.some(b => b.toLowerCase().includes(branchFilter.toLowerCase()))) return false;
      return true;
    });
  }, [graphCommits, authorFilter, branchFilter]);

  const layout = useMemo(() => computeLayout(filteredCommits), [filteredCommits]);

  // Calculate dynamic info column offset based on max lane used
  const maxLane = useMemo(() => {
    let max = 0;
    for (const n of layout) {
      if (n.lane > max) max = n.lane;
    }
    return max;
  }, [layout]);

  const infoLeftPad = Math.max(180, (maxLane + 2) * LANE_WIDTH + GRAPH_LEFT_PAD + 20);
  const svgWidth = Math.max(1000, infoLeftPad + 700);
  const svgHeight = Math.max(600, (filteredCommits.length || 1) * ROW_HEIGHT + 60);

  const layoutMap = useMemo(
    () => new Map(layout.map(node => [node.commit.hash, node])),
    [layout],
  );

  const handleRefresh = useCallback(async () => {
    await loadGraph();
  }, [loadGraph]);

  const handleCommitClick = useCallback((commit: GraphCommit) => {
    setSelectedCommit(prev => prev?.hash === commit.hash ? null : commit);
    setHash('graph', { commit: commit.short_hash });
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedCommit(null);
    setHash('graph');
  }, []);

  const handleCheckout = useCallback(async (branch: string) => {
    if (!activeRepo) return;
    try {
      await cmd.gitCheckout(activeRepo, branch);
      addToast('success', `Checked out ${branch}`);
      loadGraph();
    } catch (e) {
      addToast('error', `Checkout failed: ${e}`);
    }
  }, [activeRepo, addToast, loadGraph]);

  const handleCreateWorktree = useCallback(async (branch: string) => {
    if (!activeRepo) return;
    const repoName = activeRepo.split('/').pop() || 'repo';
    const wtPath = `${activeRepo}/../${repoName}-${branch.replace(/[^a-zA-Z0-9-_]/g, '-')}`;
    try {
      await cmd.addWorktree(activeRepo, wtPath, branch, false, null, false, true, false);
      addToast('success', `Worktree created for ${branch}`);
      loadGraph();
    } catch {
      // Branch doesn't exist yet — create it
      try {
        await cmd.addWorktree(activeRepo, wtPath, branch, true, null, false, true, false);
        addToast('success', `Worktree created with new branch ${branch}`);
        loadGraph();
      } catch (e2) {
        addToast('error', `Failed to create worktree: ${e2}`);
      }
    }
  }, [activeRepo, addToast, loadGraph]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }, []);

  if (graphLoading && graphCommits.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-transparent">
        <LoadingSpinner />
      </div>
    );
  }

  if (!graphCommits || graphCommits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 gap-4 bg-transparent">
        <GitCommit className="w-12 h-12 text-white/10" />
        <div className="text-center">
          <h3 className="text-sm font-medium text-white/50 mb-1">No commits to display</h3>
          <p className="text-xs text-white/30 mb-4">Load a repository to see the branch graph</p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={graphLoading}
          variant="secondary"
          size="sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Load Graph
        </Button>
      </div>
    );
  }

  // Check which commits have branches with worktrees
  const hasWt = (commit: GraphCommit) =>
    commit.branches?.some(b => worktreeBranches.has(b.replace('refs/heads/', ''))) ?? false;

  return (
    <div className="w-full h-screen flex flex-row bg-transparent">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950/40">
          <h2 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-cyan-400" />
            Branch Graph
            <span className="text-gray-500 font-normal ml-1 text-xs">
              {filteredCommits.length}{filteredCommits.length !== graphCommits.length ? `/${graphCommits.length}` : ''} commits
            </span>
          </h2>
          <div className="flex items-center gap-3">
            <GraphFilters
              authorFilter={authorFilter}
              branchFilter={branchFilter}
              onAuthorChange={setAuthorFilter}
              onBranchChange={setBranchFilter}
            />
            <Button
              onClick={handleRefresh}
              disabled={graphLoading}
              size="sm"
              variant="ghost"
              className="flex items-center gap-2"
            >
              <RefreshCw
                className={`w-4 h-4 transition-transform ${graphLoading ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </div>

        {/* Scrollable graph area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-gradient-to-b from-slate-950 to-slate-900/50 relative"
          onMouseMove={handleMouseMove}
        >
          <svg
            width={svgWidth}
            height={svgHeight}
            className="min-w-full"
          >
            <defs>
              {LANE_COLORS.map((c, idx) => (
                <filter key={`glow-${idx}`} id={`glow-${idx}`}>
                  <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={c} floodOpacity="0.6" />
                </filter>
              ))}
            </defs>

            {/* Edges */}
            {layout.map(node => {
              const { commit, x: fromX, y: fromY } = node;
              return commit.parents.map(parentHash => {
                const parentNode = layoutMap.get(parentHash);
                if (!parentNode) return null;
                const { x: toX, y: toY } = parentNode;
                return (
                  <path
                    key={`edge-${commit.hash}-${parentHash}`}
                    d={generateEdgePath(fromX, fromY, toX, toY)}
                    stroke={node.color}
                    strokeWidth="1.5"
                    fill="none"
                    opacity="0.35"
                    strokeLinecap="round"
                  />
                );
              });
            })}

            {/* Commit nodes */}
            {layout.map(node => {
              const { commit, x, y, color, isMerge } = node;
              const radius = isMerge ? MERGE_RADIUS : NODE_RADIUS;
              const isHovered = hoveredHash === commit.hash;
              const isSelected = selectedCommit?.hash === commit.hash;
              const wtActive = hasWt(commit);

              return (
                <g
                  key={`node-${commit.hash}`}
                  onMouseEnter={() => setHoveredHash(commit.hash)}
                  onMouseLeave={() => setHoveredHash(null)}
                  onClick={() => handleCommitClick(commit)}
                  className="cursor-pointer"
                >
                  {/* Glow ring for worktree branches */}
                  {wtActive && (
                    <circle
                      cx={x}
                      cy={y}
                      r={radius + 4}
                      fill="none"
                      stroke={color}
                      strokeWidth="1"
                      opacity="0.4"
                      filter={`url(#glow-${node.lane % LANE_COLORS.length})`}
                    />
                  )}
                  {isSelected && (
                    <circle cx={x} cy={y} r={radius + 6} fill="none" stroke="#818cf8" strokeWidth="1.5" opacity="0.5" />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered || isSelected ? radius + 2 : radius}
                    fill={color}
                    opacity={isHovered || isSelected ? 1 : 0.85}
                    style={{ transition: 'r 0.15s ease, opacity 0.15s ease' }}
                  />
                  {isMerge && (
                    <circle
                      cx={x}
                      cy={y}
                      r={radius + 2}
                      fill="none"
                      stroke={color}
                      strokeWidth="0.5"
                      opacity="0.3"
                    />
                  )}
                </g>
              );
            })}

            {/* Commit info rows */}
            {layout.map(node => {
              const { commit, y } = node;
              const isHovered = hoveredHash === commit.hash;
              const isSelected = selectedCommit?.hash === commit.hash;
              const wtActive = hasWt(commit);

              // Branch badges (inline, before message)
              const branchLabels = commit.branches?.filter(b => b.length > 0) ?? [];
              let branchTotalWidth = 0;
              const branchItems = branchLabels.slice(0, 2).map(b => {
                const label = truncateBranch(b);
                const w = label.length * 7 + 14;
                const item = { label, x: infoLeftPad + branchTotalWidth, w };
                branchTotalWidth += w + 6;
                return item;
              });

              const messageX = infoLeftPad + branchTotalWidth;

              return (
                <g key={`info-${commit.hash}`} onClick={() => handleCommitClick(commit)} className="cursor-pointer">
                  {/* Row hover/selected highlight */}
                  {(isHovered || isSelected) && (
                    <rect
                      x="0"
                      y={y - ROW_HEIGHT / 2 + 2}
                      width={svgWidth}
                      height={ROW_HEIGHT - 4}
                      fill={isSelected ? 'rgba(99, 102, 241, 0.12)' : isLight ? 'rgba(99, 102, 241, 0.06)' : 'rgba(30, 41, 59, 0.45)'}
                      rx="4"
                    />
                  )}

                  {/* Branch badges */}
                  {branchItems.map(item => (
                    <g key={item.label}>
                      <rect
                        x={item.x}
                        y={y - 8}
                        width={item.w}
                        height={16}
                        rx="4"
                        fill={wtActive ? 'rgba(34, 211, 238, 0.15)' : isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(55, 65, 81, 0.5)'}
                        stroke={wtActive ? '#22d3ee' : isLight ? 'rgba(0, 0, 0, 0.15)' : '#4b5563'}
                        strokeWidth="0.5"
                      />
                      <text
                        x={item.x + 7}
                        y={y + 3}
                        fontSize="10"
                        fill={wtActive ? (isLight ? '#0891b2' : '#67e8f9') : isLight ? '#374151' : '#d1d5db'}
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {item.label}
                      </text>
                    </g>
                  ))}

                  {/* Commit message */}
                  <text
                    x={messageX}
                    y={y + 4}
                    fontSize="12"
                    fill={isHovered ? (isLight ? '#111827' : '#f1f5f9') : isLight ? '#4b5563' : '#94a3b8'}
                    fontFamily="Inter, sans-serif"
                  >
                    {truncateMessage(commit.message)}
                  </text>

                  {/* Author · date (right-aligned region) */}
                  <text
                    x={svgWidth - 20}
                    y={y + 4}
                    fontSize="11"
                    fill={isLight ? '#6b7280' : '#64748b'}
                    fontFamily="Inter, sans-serif"
                    textAnchor="end"
                    opacity={isHovered ? 0.9 : 0.55}
                  >
                    {commit.author} · {commit.date}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Floating tooltip */}
          {hoveredHash && tooltipPos && layoutMap.has(hoveredHash) && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute pointer-events-none z-50 bg-gray-900/95 border border-gray-700 rounded-lg px-3 py-2.5 text-xs backdrop-blur-sm shadow-xl"
              style={{
                left: `${Math.min(tooltipPos.x + 16, (containerRef.current?.clientWidth ?? 600) - 280)}px`,
                top: `${tooltipPos.y - 60}px`,
              }}
            >
              {(() => {
                const c = layoutMap.get(hoveredHash)!.commit;
                return (
                  <>
                    <div className="font-mono text-cyan-400 text-[11px]">{c.short_hash}</div>
                    <div className="text-gray-200 max-w-[260px] truncate mt-1 font-medium">{c.message}</div>
                    <div className="text-gray-400 mt-1.5">{c.author}</div>
                    <div className="text-gray-500">{c.date}</div>
                    {c.branches.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {c.branches.map(b => (
                          <span
                            key={b}
                            className="px-1.5 py-0.5 bg-gray-800 text-gray-300 rounded text-[10px] font-mono"
                          >
                            {b.replace('refs/heads/', '')}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-800 bg-gray-950/40 text-xs text-gray-500 flex items-center gap-4">
          <span>{filteredCommits.length} commits</span>
          {worktrees.length > 0 && <span>· {worktrees.length} active worktrees</span>}
        </div>
      </div>

      {/* Commit detail panel */}
      <CommitDetailPanel
        commit={selectedCommit}
        onClose={handleCloseDetail}
        onCheckout={handleCheckout}
        onCreateWorktree={handleCreateWorktree}
        worktreeBranches={worktreeBranches}
      />
    </div>
  );
}
