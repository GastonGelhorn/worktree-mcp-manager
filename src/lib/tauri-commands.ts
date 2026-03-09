import { invoke } from '@tauri-apps/api/core';
import type { Worktree, Branch, FrameworkInfo, CommitInfo, GraphCommit, StashEntry } from '../types';

// Git Worktree Operations
export async function listWorktrees(repoPath: string): Promise<Worktree[]> {
  return invoke('list_worktrees', { repoPath });
}

export async function addWorktree(repoPath: string, path: string, branch: string, createBranch: boolean, newDbName: string | null, assignVitePort: boolean, copyConfigs: boolean, cloneDb: boolean): Promise<void> {
  return invoke('add_worktree', { repoPath, path, branch, createBranch, newDbName, assignVitePort, copyConfigs, cloneDb });
}

export async function removeWorktree(repoPath: string, path: string, force: boolean = true): Promise<void> {
  return invoke('remove_worktree', { repoPath, path, force });
}

// Branch Operations
export async function listBranches(repoPath: string): Promise<Branch[]> {
  return invoke('list_branches', { repoPath });
}

// Herd Integration
export async function herdLink(path: string, projectName: string): Promise<void> {
  return invoke('herd_link', { path, projectName });
}

export async function herdUnlink(path: string, projectName: string): Promise<void> {
  return invoke('herd_unlink', { path, projectName });
}


export async function startProcess(path: string, command: string): Promise<void> {
  return invoke('start_process', { path, command });
}

export async function stopProcess(path: string): Promise<void> {
  return invoke('stop_process', { path });
}

// PR/MR Generation
export async function generatePrUrl(repoPath: string, branch: string): Promise<string> {
  return invoke('generate_pr_url', { repoPath, branch });
}

// AI Context Injection
export async function injectPrompt(wtPath: string, branch: string, context: string): Promise<void> {
  return invoke('inject_prompt', { wtPath, branch, context });
}

export async function injectClaudeContext(wtPath: string, branch: string, context: string): Promise<string> {
  return invoke('inject_claude_context', { wtPath, branch, context });
}

// Inter-Worktree Operations
export async function grabFile(repoPath: string, wtPath: string, srcBranch: string, file: string): Promise<string> {
  return invoke('grab_file', { repoPath, wtPath, srcBranch, file });
}

export async function getChanges(wtPath: string): Promise<string> {
  return invoke('get_changes', { wtPath });
}

export async function stageFiles(wtPath: string, paths: string[]): Promise<void> {
  return invoke('stage_files', { wtPath, paths });
}

export async function unstageFiles(wtPath: string, paths: string[]): Promise<void> {
  return invoke('unstage_files', { wtPath, paths });
}

export async function commit(wtPath: string, message: string): Promise<void> {
  return invoke('commit', { wtPath, message });
}

export async function saveCommitTemplate(template: string): Promise<void> {
  return invoke('save_commit_template', { template });
}

export async function pull(wtPath: string): Promise<string> {
  return invoke('pull', { wtPath });
}

export async function push(wtPath: string): Promise<string> {
  return invoke('push', { wtPath });
}

export async function fetch(repoPath: string): Promise<string> {
  return invoke('fetch', { repoPath });
}

export async function mergeBranchInto(
  wtPath: string,
  targetBranch: string,
  branchToMerge: string
): Promise<void> {
  return invoke('merge_branch_into', { wtPath, targetBranch, branchToMerge });
}

export async function getFileDiffSides(
  wtPath: string,
  path: string
): Promise<[string | null, string | null]> {
  return invoke('get_file_diff_sides', { wtPath, path });
}

export async function mergeAndCleanup(
  repoPath: string,
  wtPath: string,
  targetBranch: string,
  branchToMerge: string
): Promise<void> {
  return invoke('merge_and_cleanup', { repoPath, wtPath, targetBranch, branchToMerge });
}

// Framework Detection
export async function checkFramework(path: string): Promise<FrameworkInfo> {
  return invoke('check_framework', { path });
}

// New commands (to be added to backend)
export async function getLastCommit(wtPath: string): Promise<CommitInfo> {
  return invoke('get_last_commit', { wtPath });
}

export async function getAheadBehind(wtPath: string, branch: string): Promise<{ ahead: number; behind: number }> {
  return invoke('get_ahead_behind', { wtPath, branch });
}

// Branch Graph
export async function getBranchGraph(repoPath: string, maxCommits: number = 80): Promise<GraphCommit[]> {
  return invoke('get_branch_graph', { repoPath, maxCommits });
}

// Repository Scanning
export async function scanRepos(dirPath: string): Promise<string[]> {
  return invoke('scan_repos', { dirPath });
}

// Branch Checkout & Stash
export async function gitCheckout(repoPath: string, branch: string): Promise<void> {
  return invoke('git_checkout', { repoPath, branch });
}

export async function gitStash(repoPath: string, message: string): Promise<string> {
  return invoke('git_stash', { repoPath, message });
}

export async function hasUncommittedChanges(repoPath: string): Promise<boolean> {
  return invoke('has_uncommitted_changes', { repoPath });
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
  return invoke('get_current_branch', { repoPath });
}

// Stash Management
export async function listStashes(repoPath: string): Promise<StashEntry[]> {
  return invoke('list_stashes', { repoPath });
}

export async function gitStashPop(repoPath: string, index: number): Promise<string> {
  return invoke('git_stash_pop', { repoPath, index });
}

export async function gitStashDrop(repoPath: string, index: number): Promise<void> {
  return invoke('git_stash_drop', { repoPath, index });
}

// Branch Deletion
export async function deleteBranch(repoPath: string, branch: string, force: boolean = false): Promise<void> {
  return invoke('delete_branch', { repoPath, branch, force });
}

// Repo Fingerprint (for change detection)
export async function getRepoFingerprint(repoPath: string): Promise<string> {
  return invoke('get_repo_fingerprint', { repoPath });
}

// Open a folder in a new Cursor window (runs from app process, so it works when MCP cannot)
export async function openInCursor(path: string): Promise<void> {
  return invoke('open_in_cursor', { path });
}

// Register the local MCP server in Claude Code globally
export async function registerMcpServer(): Promise<string> {
  return invoke('register_mcp_server');
}

// Setup MCP in all detected IDEs (Cursor, VS Code, Claude CLI)
export interface IdeSetupResult {
  ide: string;
  path: string;
  success: boolean;
  message: string;
}

export async function setupAllIdes(repoPath: string): Promise<IdeSetupResult[]> {
  return invoke('setup_all_ides', { repoPath });
}

// ═══ New Feature Commands (Phase 1 & 2) ═══
export {
  getWorktreeState,
  checkBranchIntegration,
  mergeWithStrategy,
  mergeDryRun,
  abortMerge,
  getCiStatus,
  predictConflicts,
  agentClaim,
  agentRelease,
  agentListClaims,
  agentHeartbeat,
  discoverHooks,
  analyzeDiff,
  suggestWorktree,
  injectContextV2,
  resolveShortcut,
} from './tauri-commands-new';
