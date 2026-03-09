import { TrendingUp, TrendingDown, Zap } from 'lucide-react';
import type { RiskLevel } from '../../types/new-types';

interface BranchRiskData {
  name: string;
  ahead: number;
  behind: number;
  hasConflicts: boolean;
}

interface ConflictRadarProps {
  branches: BranchRiskData[];
}

export function ConflictRadar({ branches }: ConflictRadarProps) {
  const getRiskLevel = (branch: BranchRiskData): RiskLevel => {
    if (branch.hasConflicts) return 'High';
    if (branch.ahead > 0 && branch.behind > 0) return 'High';
    if (branch.behind > 10) return 'Medium';
    if (branch.behind > 0) return 'Low';
    return 'Low';
  };

  const getRiskConfig = (
    level: RiskLevel
  ): {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    icon: React.ReactNode;
  } => {
    const configs: Record<RiskLevel, {
      label: string;
      color: string;
      bgColor: string;
      borderColor: string;
      icon: React.ReactNode;
    }> = {
      High: {
        label: 'High - Diverging or Conflicts',
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/10',
        borderColor: 'border-orange-500/30',
        icon: <Zap className="w-4 h-4" />,
      },
      Medium: {
        label: 'Medium - Behind',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30',
        icon: <TrendingDown className="w-4 h-4" />,
      },
      Low: {
        label: 'Low - Integrated',
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/30',
        icon: null,
      },
    };
    return configs[level];
  };

  const sorted = [...branches].sort((a, b) => {
    const levelOrder: Record<RiskLevel, number> = { High: 0, Medium: 1, Low: 2 };
    return levelOrder[getRiskLevel(a)] - levelOrder[getRiskLevel(b)];
  });

  if (branches.length === 0) {
    return (
      <div className="py-8 px-4 text-center rounded-lg border border-white/5 bg-white/2">
        <p className="text-sm text-white/50">No branches to analyze</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-white/80 mb-3">Branch Integration Status</h3>
      <div className="divide-y divide-white/5">
        {sorted.map((branch, idx) => {
          const risk = getRiskLevel(branch);
          const config = getRiskConfig(risk);

          return (
            <div
              key={idx}
              className={`p-3 flex items-start justify-between gap-3 border-l-2 ${config.borderColor}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-white/90 font-mono truncate">
                    {branch.name}
                  </span>
                  <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                </div>

                <div className="flex items-center gap-4 text-xs text-white/50">
                  {branch.ahead > 0 && (
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-blue-400" />
                      <span>{branch.ahead} ahead</span>
                    </div>
                  )}
                  {branch.behind > 0 && (
                    <div className="flex items-center gap-1">
                      <TrendingDown className="w-3 h-3 text-amber-400" />
                      <span>{branch.behind} behind</span>
                    </div>
                  )}
                  {branch.ahead === 0 && branch.behind === 0 && !branch.hasConflicts && (
                    <span className="text-emerald-400/70">Fully integrated</span>
                  )}
                </div>
              </div>

              {/* Risk Indicator */}
              <div
                className={`flex items-center gap-2 px-2 py-1 rounded text-xs font-medium shrink-0 ${config.bgColor} ${config.color}`}
              >
                {config.icon}
                <span>{risk.charAt(0).toUpperCase() + risk.slice(1)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 p-3 rounded-lg bg-white/2 border border-white/5">
        <p className="text-xs font-medium text-white/50 mb-2">Risk Levels</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-white/40">
          <div>
            <span className="text-red-400">Critical</span> - Has conflicts
          </div>
          <div>
            <span className="text-orange-400">High</span> - Both ahead &amp; behind
          </div>
          <div>
            <span className="text-amber-400">Medium</span> - &gt;10 commits behind
          </div>
          <div>
            <span className="text-emerald-400">Low/None</span> - Integrated
          </div>
        </div>
      </div>
    </div>
  );
}
