// ═══ Worktree State (state.rs) ═══
export type WorktreeStatus = 'Clean' | 'Dirty' | 'Conflicts' | 'Rebasing' | 'Merging' | 'Detached';

export interface RebaseProgress {
  current: number;
  total: number;
}

export interface WorktreeState {
  status: WorktreeStatus;
  staged_count: number;
  modified_count: number;
  untracked_count: number;
  stash_count: number;
  ahead: number;
  behind: number;
  last_commit_age: string;
  conflicting_files: string[];
  rebase_progress: RebaseProgress | null;
}

// ═══ Integration Checks (integration.rs) ═══
export type IntegrationLevel =
  | 'SameCommit'
  | 'Ancestor'
  | 'NoAddedChanges'
  | 'TreesMatch'
  | 'MergeAddsNothing'
  | 'NotIntegrated';

export interface IntegrationResult {
  level: IntegrationLevel;
  safe_to_delete: boolean;
  details: string;
  ahead: number;
  behind: number;
  elapsed_ms: number;
}

// ═══ Merge (merge.rs) ═══
export type MergeStrategy = 'Merge' | 'Squash' | 'Rebase' | 'FastForward';

export interface MergeOptions {
  strategy: MergeStrategy;
  target_branch: string;
  source_branch: string;
  auto_cleanup: boolean;
  generate_message: boolean;
}

export interface MergeDryRunResult {
  will_conflict: boolean;
  conflicting_files: string[];
  files_changed: number;
  insertions: number;
  deletions: number;
  strategy: MergeStrategy;
}

export interface MergeResult {
  success: boolean;
  strategy: MergeStrategy;
  message: string;
  commit_sha: string | null;
}

// ═══ CI/CD (ci.rs) ═══
export type CiProvider = 'GitHub' | 'GitLab' | 'Unknown';
export type CiStatus = 'Passed' | 'Failed' | 'Running' | 'Pending' | 'None';
export type ReviewStatus = 'Approved' | 'ChangesRequested' | 'Pending' | 'None';

export interface CiCheck {
  name: string;
  status: CiStatus;
  url: string | null;
  summary: string | null;
}

export interface CiResult {
  provider: CiProvider;
  branch: string;
  pr_number: number | null;
  pr_url: string | null;
  ci_status: CiStatus;
  checks: CiCheck[];
  is_mergeable: boolean;
  review_status: ReviewStatus;
  stale: boolean;
}

// ═══ Conflict Prediction (conflict_prediction.rs) ═══
export type ConflictSeverity = 'AutoResolvable' | 'ManualRequired';

export interface ConflictFile {
  path: string;
  severity: ConflictSeverity;
}

export interface ConflictPrediction {
  will_conflict: boolean;
  conflicting_files: ConflictFile[];
  recommendation: string;
}

// ═══ Agent Orchestration (agent_orchestration.rs) ═══
export interface AgentClaim {
  agent_id: string;
  task: string;
  claimed_at: string;
  heartbeat: string;
  estimated_duration: string | null;
}

export interface ClaimsFile {
  claims: Record<string, AgentClaim>;
}

export interface ClaimResult {
  claimed: boolean;
  conflict: AgentClaim | null;
}

// ═══ Task Router (task_router.rs) ═══
export type Recommendation = 'UseExisting' | 'CreateNew';

export interface WorktreeMatch {
  path: string;
  branch: string;
  relevance_score: number;
  reason: string;
}

export interface TaskSuggestion {
  recommendation: Recommendation;
  worktree_path: string | null;
  suggested_branch: string;
  reasoning: string;
  matches: WorktreeMatch[];
}

// ═══ Diff Intelligence (diff_intelligence.rs) ═══
export type RiskLevel = 'Low' | 'Medium' | 'High';

export interface FileCategory {
  category: string;
  files: string[];
}

export interface DiffAnalysis {
  summary: string;
  risk_level: RiskLevel;
  risk_factors: string[];
  categories: FileCategory[];
  breaking_changes: string[];
  total_files: number;
  total_insertions: number;
  total_deletions: number;
}

// ═══ Hooks (hooks.rs) ═══
export type HookType = 'PostCreate' | 'PostSwitch' | 'PreMerge' | 'PostMerge' | 'PreRemove' | 'PostRemove';
export type HookSource = 'User' | 'Project';

export interface HookConfig {
  commands: string[];
  background: boolean;
  timeout_seconds: number | null;
}

export interface HookDef {
  hook_type: HookType;
  config: HookConfig;
  source: HookSource;
}

export interface HookExecResult {
  hook: string;
  success: boolean;
  output: string;
  duration_ms: number;
}

// ═══ Context V2 (context_v2.rs) ═══
export type ContextDepth = 'Minimal' | 'Standard' | 'Deep';
export type ContextTarget = 'Claude' | 'Cursor' | 'Antigravity' | 'All';

export interface ContextConfig {
  depth: ContextDepth;
  target: ContextTarget;
  task_description: string | null;
}

export interface GeneratedContext {
  files_written: string[];
  content_summary: string;
}

// ═══ Workflows (workflows.rs) ═══
export interface WorkflowStep {
  tool: string;
  params: Record<string, unknown>;
  description: string;
}

export interface WorkflowDef {
  name: string;
  steps: WorkflowStep[];
  requires_confirmation: boolean;
}

export interface StepResult {
  step: string;
  success: boolean;
  output: Record<string, unknown>;
  error: string | null;
}

export interface WorkflowResult {
  success: boolean;
  steps_completed: number;
  total_steps: number;
  results: StepResult[];
}

// ═══ Shortcuts (shortcuts.rs) ═══
export interface ShortcutResolution {
  input: string;
  branch: string;
  source: string;
}
