import { invoke } from '@tauri-apps/api/core';
import type {
  WorktreeState,
  IntegrationResult,
  MergeResult,
  MergeDryRunResult,
  CiResult,
  ConflictPrediction,
  ClaimResult,
  ClaimsFile,
  HookDef,
  DiffAnalysis,
  TaskSuggestion,
  GeneratedContext,
  WorkflowResult,
  WorkflowDef,
} from '../types/new-types';

// Worktree State
export async function getWorktreeState(wtPath: string): Promise<WorktreeState> {
  return invoke('get_worktree_state', { wtPath });
}

// Branch Integration
export async function checkBranchIntegration(
  repoPath: string,
  branch: string,
  target: string
): Promise<IntegrationResult> {
  return invoke('check_branch_integration', { repoPath, branch, target });
}

// Merge Operations
export async function mergeWithStrategy(
  repoPath: string,
  wtPath: string,
  targetBranch: string,
  sourceBranch: string,
  strategy: string,
  autoCleanup: boolean
): Promise<MergeResult> {
  return invoke('merge_with_strategy', {
    repoPath, wtPath, targetBranch, sourceBranch, strategy, autoCleanup,
  });
}

export async function mergeDryRun(
  repoPath: string,
  source: string,
  target: string,
  strategy: string
): Promise<MergeDryRunResult> {
  return invoke('merge_dry_run', { repoPath, source, target, strategy });
}

export async function abortMerge(wtPath: string): Promise<void> {
  return invoke('abort_merge', { wtPath });
}

// CI/CD Status
export async function getCiStatus(repoPath: string, branch: string): Promise<CiResult> {
  return invoke('get_ci_status', { repoPath, branch });
}

// Conflict Prediction
export async function predictConflicts(
  repoPath: string,
  branch: string,
  target: string
): Promise<ConflictPrediction> {
  return invoke('predict_conflicts', { repoPath, branch, target });
}

// Agent Claims
export async function agentClaim(
  repoPath: string,
  wtPath: string,
  agentId: string,
  task: string,
  estimatedDuration?: string
): Promise<ClaimResult> {
  return invoke('agent_claim_worktree', {
    repoPath, wtPath, agentId, task, estimatedDuration: estimatedDuration ?? null,
  });
}

export async function agentRelease(
  repoPath: string,
  wtPath: string,
  agentId: string
): Promise<void> {
  return invoke('agent_release_worktree', { repoPath, wtPath, agentId });
}

export async function agentListClaims(repoPath: string): Promise<ClaimsFile> {
  return invoke('agent_list_claims', { repoPath });
}

export async function agentHeartbeat(
  repoPath: string,
  wtPath: string,
  agentId: string
): Promise<void> {
  return invoke('agent_heartbeat', { repoPath, wtPath, agentId });
}

// Hooks Management
export async function discoverHooks(repoPath: string): Promise<HookDef[]> {
  return invoke('discover_hooks', { repoPath });
}

// Diff Analysis
export async function analyzeDiff(
  repoPath: string,
  branch: string,
  target: string
): Promise<DiffAnalysis> {
  return invoke('analyze_diff', { repoPath, branch, target });
}

// Task Suggestions
export async function suggestWorktree(
  repoPath: string,
  taskDescription: string
): Promise<TaskSuggestion> {
  return invoke('suggest_worktree', { repoPath, taskDescription });
}

// Context Generation
export async function injectContextV2(
  wtPath: string,
  branch: string,
  depth: string,
  target: string
): Promise<GeneratedContext> {
  return invoke('inject_context_v2', { wtPath, branch, depth, target });
}

// Shortcuts
export async function resolveShortcut(repoPath: string, input: string): Promise<string> {
  return invoke('resolve_shortcut', { repoPath, input });
}

// Workflows
export async function listWorkflows(repoPath: string): Promise<WorkflowDef[]> {
  return invoke('list_workflows', { repoPath });
}

export async function executeWorkflow(repoPath: string, workflowName: string): Promise<WorkflowResult> {
  return invoke('execute_workflow', { repoPath, workflowName });
}

export async function saveWorkflow(workflow: WorkflowDef): Promise<void> {
  return invoke('save_workflow', { workflowJson: JSON.stringify(workflow) });
}

export async function deleteWorkflow(name: string): Promise<void> {
  return invoke('delete_workflow', { name });
}
