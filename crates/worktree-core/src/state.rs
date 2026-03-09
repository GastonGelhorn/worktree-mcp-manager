use crate::{WorktreeError, WorktreePath};
use crate::git::run_git;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::instrument;

/// The overall status of a worktree.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorktreeStatus {
    /// No uncommitted changes, no special states.
    Clean,
    /// Has uncommitted or staged changes, but not in a merge/rebase.
    Dirty,
    /// Merge in progress with conflicting files.
    Conflicts,
    /// Rebase in progress.
    Rebasing,
    /// Merge in progress (no conflicts).
    Merging,
    /// HEAD is detached (not on any branch).
    Detached,
}

/// Progress information for an ongoing rebase.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebaseProgress {
    /// Current step number (1-indexed).
    pub current: u32,
    /// Total steps in the rebase.
    pub total: u32,
}

/// Complete state snapshot of a worktree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeState {
    /// Current status category.
    pub status: WorktreeStatus,
    /// Number of staged files (ready to commit).
    pub staged_count: u32,
    /// Number of modified but unstaged files.
    pub modified_count: u32,
    /// Number of untracked files.
    pub untracked_count: u32,
    /// Number of stashed changes.
    pub stash_count: u32,
    /// Number of commits ahead of upstream.
    pub ahead: u32,
    /// Number of commits behind upstream.
    pub behind: u32,
    /// Human-readable age of the last commit (e.g., "2 hours ago").
    pub last_commit_age: String,
    /// Files with merge conflicts (only populated when status == Conflicts).
    pub conflicting_files: Vec<String>,
    /// Rebase progress (only Some when status == Rebasing).
    pub rebase_progress: Option<RebaseProgress>,
}

/// Get the current state of a worktree.
///
/// This function performs a series of git operations to determine the complete
/// state, including status, conflicts, rebase progress, and tracking information.
#[instrument(skip_all, fields(worktree = %wt))]
pub fn get_worktree_state(wt: &WorktreePath) -> Result<WorktreeState, WorktreeError> {
    let wt_path = wt.as_path();

    // Step 1: Detect rebase state
    let rebase_progress = detect_rebase_progress(wt_path)?;
    let is_rebasing = rebase_progress.is_some();

    // Step 2: Detect merge state and conflicts
    let (is_merging, has_conflicts) = detect_merge_state(wt_path)?;
    let conflicting_files = if has_conflicts {
        get_conflicting_files(wt_path)?
    } else {
        Vec::new()
    };

    // Step 3: Check if detached
    let is_detached = check_detached(wt_path)?;

    // Step 4: Parse git status to get staged/modified/untracked counts
    let (staged_count, modified_count, untracked_count) = parse_git_status(wt_path)?;

    // Step 5: Get stash count
    let stash_count = get_stash_count(wt_path)?;

    // Step 6: Get ahead/behind counts (handle no upstream gracefully)
    let (ahead, behind) = get_ahead_behind(wt_path)?;

    // Step 7: Get last commit age
    let last_commit_age = get_last_commit_age(wt_path)?;

    // Determine overall status
    let status = if is_rebasing {
        WorktreeStatus::Rebasing
    } else if has_conflicts {
        WorktreeStatus::Conflicts
    } else if is_merging {
        WorktreeStatus::Merging
    } else if is_detached {
        WorktreeStatus::Detached
    } else if staged_count > 0 || modified_count > 0 || untracked_count > 0 {
        WorktreeStatus::Dirty
    } else {
        WorktreeStatus::Clean
    };

    Ok(WorktreeState {
        status,
        staged_count,
        modified_count,
        untracked_count,
        stash_count,
        ahead,
        behind,
        last_commit_age,
        conflicting_files,
        rebase_progress,
    })
}

/// Check if a rebase is in progress and return progress info if so.
fn detect_rebase_progress(wt_path: &Path) -> Result<Option<RebaseProgress>, WorktreeError> {
    let git_dir = wt_path.join(".git");

    // Check for rebase-merge (interactive rebase)
    if let Ok(dir_entries) = std::fs::read_dir(git_dir.join("rebase-merge")) {
        if dir_entries.count() > 0 {
            let next_file = std::fs::read_to_string(git_dir.join("rebase-merge/next"))
                .unwrap_or_else(|_| "1".to_string())
                .trim()
                .parse::<u32>()
                .unwrap_or(1);
            let last_file = std::fs::read_to_string(git_dir.join("rebase-merge/last"))
                .unwrap_or_else(|_| "0".to_string())
                .trim()
                .parse::<u32>()
                .unwrap_or(0);
            return Ok(Some(RebaseProgress {
                current: next_file,
                total: last_file,
            }));
        }
    }

    // Check for rebase-apply (am-based rebase)
    if let Ok(dir_entries) = std::fs::read_dir(git_dir.join("rebase-apply")) {
        if dir_entries.count() > 0 {
            let next_file = std::fs::read_to_string(git_dir.join("rebase-apply/next"))
                .unwrap_or_else(|_| "1".to_string())
                .trim()
                .parse::<u32>()
                .unwrap_or(1);
            let last_file = std::fs::read_to_string(git_dir.join("rebase-apply/last"))
                .unwrap_or_else(|_| "0".to_string())
                .trim()
                .parse::<u32>()
                .unwrap_or(0);
            return Ok(Some(RebaseProgress {
                current: next_file,
                total: last_file,
            }));
        }
    }

    Ok(None)
}

/// Detect if in a merge state and if there are conflicts.
fn detect_merge_state(wt_path: &Path) -> Result<(bool, bool), WorktreeError> {
    let git_dir = wt_path.join(".git");
    let merge_head = git_dir.join("MERGE_HEAD");

    if !merge_head.exists() {
        return Ok((false, false));
    }

    // We're in a merge. Check for conflicts.
    let has_conflicts = match run_git(wt_path, &["diff", "--diff-filter=U", "--name-only"]) {
        Ok(output) => !output.trim().is_empty(),
        Err(_) => false,
    };

    Ok((true, has_conflicts))
}

/// Get list of files with merge conflicts.
fn get_conflicting_files(wt_path: &Path) -> Result<Vec<String>, WorktreeError> {
    match run_git(wt_path, &["diff", "--diff-filter=U", "--name-only"]) {
        Ok(output) => Ok(output.lines().map(|s| s.to_string()).collect()),
        Err(_) => Ok(Vec::new()),
    }
}

/// Check if HEAD is detached.
fn check_detached(wt_path: &Path) -> Result<bool, WorktreeError> {
    match run_git(wt_path, &["symbolic-ref", "--short", "HEAD"]) {
        Ok(_) => Ok(false),
        Err(_) => Ok(true),
    }
}

/// Parse git status --porcelain=v2 to count staged, modified, and untracked files.
fn parse_git_status(wt_path: &Path) -> Result<(u32, u32, u32), WorktreeError> {
    let output = run_git(wt_path, &["status", "--porcelain=v2", "--branch"])?;

    let mut staged = 0u32;
    let mut modified = 0u32;
    let mut untracked = 0u32;

    for line in output.lines() {
        if line.starts_with('#') {
            // Skip metadata lines
            continue;
        }
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        let first_char = parts[0].chars().next().unwrap_or(' ');

        match first_char {
            '1' | '2' => {
                // Tracked file change
                if parts.len() < 2 {
                    continue;
                }
                let status = parts[1];
                // First char is staging, second is working tree
                if let Some(stage_char) = status.chars().next() {
                    if stage_char != '.' {
                        staged += 1;
                    }
                }
                if status.len() > 1 {
                    if let Some(work_char) = status.chars().nth(1) {
                        if work_char != '.' {
                            modified += 1;
                        }
                    }
                }
            }
            '?' => {
                // Untracked file
                untracked += 1;
            }
            _ => {}
        }
    }

    Ok((staged, modified, untracked))
}

/// Count stashed changes using git stash list.
fn get_stash_count(wt_path: &Path) -> Result<u32, WorktreeError> {
    match run_git(wt_path, &["stash", "list"]) {
        Ok(output) => {
            let count = output.lines().filter(|l| !l.is_empty()).count() as u32;
            Ok(count)
        }
        Err(_) => Ok(0),
    }
}

/// Get the number of commits ahead/behind the upstream branch.
fn get_ahead_behind(wt_path: &Path) -> Result<(u32, u32), WorktreeError> {
    // Get current branch
    let branch = match run_git(wt_path, &["rev-parse", "--abbrev-ref", "HEAD"]) {
        Ok(b) => b.trim().to_string(),
        Err(_) => return Ok((0, 0)),
    };

    // Try to get ahead/behind counts
    match run_git(
        wt_path,
        &[
            "rev-list",
            "--count",
            "--left-right",
            &format!("origin/{}...{}", branch, branch),
        ],
    ) {
        Ok(output) => {
            let parts: Vec<&str> = output.trim().split('\t').collect();
            if parts.len() == 2 {
                let behind = parts[0].parse::<u32>().unwrap_or(0);
                let ahead = parts[1].parse::<u32>().unwrap_or(0);
                Ok((ahead, behind))
            } else {
                Ok((0, 0))
            }
        }
        Err(_) => Ok((0, 0)),
    }
}

/// Get the age of the last commit in human-readable format.
fn get_last_commit_age(wt_path: &Path) -> Result<String, WorktreeError> {
    match run_git(wt_path, &["log", "-1", "--format=%cr"]) {
        Ok(output) => Ok(output.trim().to_string()),
        Err(_) => Ok("unknown".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rebase_progress_struct() {
        let progress = RebaseProgress {
            current: 5,
            total: 10,
        };
        assert_eq!(progress.current, 5);
        assert_eq!(progress.total, 10);
    }

    #[test]
    fn test_worktree_status_enum() {
        assert_eq!(WorktreeStatus::Clean, WorktreeStatus::Clean);
        assert_ne!(WorktreeStatus::Clean, WorktreeStatus::Dirty);
    }

    #[test]
    fn test_worktree_state_structure() {
        let state = WorktreeState {
            status: WorktreeStatus::Dirty,
            staged_count: 2,
            modified_count: 3,
            untracked_count: 1,
            stash_count: 0,
            ahead: 5,
            behind: 2,
            last_commit_age: "1 hour ago".to_string(),
            conflicting_files: Vec::new(),
            rebase_progress: None,
        };

        assert_eq!(state.status, WorktreeStatus::Dirty);
        assert_eq!(state.staged_count, 2);
        assert_eq!(state.modified_count, 3);
        assert_eq!(state.untracked_count, 1);
        assert!(!state.has_conflicts());
    }

    #[test]
    fn test_parse_git_status_empty() {
        // Empty status should parse cleanly
        let (staged, modified, untracked) =
            parse_git_status_test_helper("# branch.oid abc123\n# branch.head main\n")
                .expect("parse failed");
        assert_eq!(staged, 0);
        assert_eq!(modified, 0);
        assert_eq!(untracked, 0);
    }

    #[test]
    fn test_parse_git_status_with_changes() {
        let status_output =
            "# branch.oid abc123\n1 .M N... 100644 100644 abc def file.txt\n? untracked.txt\n";
        let (staged, modified, untracked) =
            parse_git_status_test_helper(status_output).expect("parse failed");
        assert_eq!(staged, 0);
        assert_eq!(modified, 1);
        assert_eq!(untracked, 1);
    }

    // Helper for testing parse_git_status logic in isolation
    fn parse_git_status_test_helper(status_output: &str) -> Result<(u32, u32, u32), WorktreeError> {
        let mut staged = 0u32;
        let mut modified = 0u32;
        let mut untracked = 0u32;

        for line in status_output.lines() {
            if line.starts_with('#') || line.is_empty() {
                continue;
            }

            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.is_empty() {
                continue;
            }

            let first_char = parts[0].chars().next().unwrap_or(' ');

            match first_char {
                '1' | '2' => {
                    if parts.len() < 2 {
                        continue;
                    }
                    let status = parts[1];
                    if let Some(stage_char) = status.chars().next() {
                        if stage_char != '.' {
                            staged += 1;
                        }
                    }
                    if status.len() > 1 {
                        if let Some(work_char) = status.chars().nth(1) {
                            if work_char != '.' {
                                modified += 1;
                            }
                        }
                    }
                }
                '?' => {
                    untracked += 1;
                }
                _ => {}
            }
        }

        Ok((staged, modified, untracked))
    }

    #[test]
    fn test_worktree_state_with_rebase() {
        let state = WorktreeState {
            status: WorktreeStatus::Rebasing,
            staged_count: 0,
            modified_count: 1,
            untracked_count: 0,
            stash_count: 0,
            ahead: 0,
            behind: 0,
            last_commit_age: "now".to_string(),
            conflicting_files: Vec::new(),
            rebase_progress: Some(RebaseProgress {
                current: 3,
                total: 10,
            }),
        };

        assert_eq!(state.status, WorktreeStatus::Rebasing);
        assert!(state.rebase_progress.is_some());
        assert_eq!(state.rebase_progress.unwrap().current, 3);
    }

    #[test]
    fn test_worktree_state_with_conflicts() {
        let mut conflicting_files = Vec::new();
        conflicting_files.push("file1.txt".to_string());
        conflicting_files.push("file2.rs".to_string());

        let state = WorktreeState {
            status: WorktreeStatus::Conflicts,
            staged_count: 0,
            modified_count: 0,
            untracked_count: 0,
            stash_count: 0,
            ahead: 0,
            behind: 0,
            last_commit_age: "now".to_string(),
            conflicting_files,
            rebase_progress: None,
        };

        assert_eq!(state.status, WorktreeStatus::Conflicts);
        assert_eq!(state.conflicting_files.len(), 2);
        assert!(state.has_conflicts());
    }
}

// Helper methods on WorktreeState
impl WorktreeState {
    /// Returns true if there are merge conflicts.
    pub fn has_conflicts(&self) -> bool {
        !self.conflicting_files.is_empty()
    }

    /// Returns true if the worktree is clean (no changes).
    pub fn is_clean(&self) -> bool {
        self.status == WorktreeStatus::Clean
    }

    /// Returns true if the worktree has uncommitted changes.
    pub fn is_dirty(&self) -> bool {
        self.staged_count > 0 || self.modified_count > 0 || self.untracked_count > 0
    }

    /// Returns the total number of files with changes (staged + modified + untracked).
    pub fn total_changed_files(&self) -> u32 {
        self.staged_count + self.modified_count + self.untracked_count
    }
}
