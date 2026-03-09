export interface Worktree {
  path: string;
  head: string | null;
  branch: string | null;
  is_detached: boolean;
  is_locked: boolean;
  prunable: boolean;
}

export interface Branch {
  name: string;
  is_current: boolean;
  is_remote: boolean;
}

export interface FrameworkInfo {
  is_laravel: boolean;
  has_composer: boolean;
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface WorktreeEnriched extends Worktree {
  status?: string;
  prUrl?: string;
  lastCommit?: CommitInfo;
  processRunning?: boolean;
  isMain?: boolean;
  aheadBehind?: { ahead: number; behind: number };
}

export interface GraphCommit {
  hash: string;
  short_hash: string;
  parents: string[];
  branches: string[];
  message: string;
  author: string;
  date: string;
}

export interface StashEntry {
  index: number;
  message: string;
  branch: string;
}

export type ViewMode = 'grid' | 'list' | 'table';
export type TabView = 'worktrees' | 'changes' | 'graph' | 'stashes' | 'multi-repo' | 'agent' | 'workflows';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  description?: string;
}

// ═══ New Feature Types (Phase 1 & 2) ═══
export type {
  WorktreeStatus,
  RebaseProgress,
  WorktreeState,
  IntegrationLevel,
  IntegrationResult,
  MergeStrategy,
  MergeOptions,
  MergeDryRunResult,
  MergeResult,
  CiProvider,
  CiStatus,
  ReviewStatus,
  CiCheck,
  CiResult,
  ConflictSeverity,
  ConflictFile,
  ConflictPrediction,
  AgentClaim,
  ClaimsFile,
  ClaimResult,
  Recommendation,
  WorktreeMatch,
  TaskSuggestion,
  RiskLevel,
  FileCategory,
  DiffAnalysis,
  HookType,
  HookSource,
  HookConfig,
  HookDef,
  HookExecResult,
  ContextDepth,
  ContextTarget,
  ContextConfig,
  GeneratedContext,
  WorkflowStep,
  WorkflowDef,
  StepResult,
  WorkflowResult,
  ShortcutResolution,
} from './new-types';
