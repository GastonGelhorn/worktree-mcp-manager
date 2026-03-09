use crate::{WorktreeError, RepoPath, WorktreePath};
use crate::git::run_git;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tracing::instrument;

/// Merge strategy to use when merging branches.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MergeStrategy {
    /// Regular three-way merge, creating a merge commit.
    Merge,
    /// Squash all commits into one before merging.
    Squash,
    /// Rebase the source branch onto the target, then fast-forward.
    Rebase,
    /// Fast-forward only; fails if not possible.
    FastForward,
}

/// Options for a merge operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeOptions {
    /// The merge strategy to use.
    pub strategy: MergeStrategy,
    /// The target branch to merge into.
    pub target_branch: String,
    /// The source branch to merge from.
    pub source_branch: String,
    /// Whether to automatically clean up the source branch after a successful merge.
    pub auto_cleanup: bool,
    /// Whether to automatically generate a commit message.
    pub generate_message: bool,
}

/// Result of a dry-run merge simulation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeDryRunResult {
    /// Whether the merge will result in conflicts.
    pub will_conflict: bool,
    /// List of files that will conflict.
    pub conflicting_files: Vec<String>,
    /// Number of files changed.
    pub files_changed: u32,
    /// Number of lines inserted.
    pub insertions: u32,
    /// Number of lines deleted.
    pub deletions: u32,
    /// The strategy used for the simulation.
    pub strategy: MergeStrategy,
}

/// Result of a merge operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResult {
    /// Whether the merge succeeded without conflicts.
    pub success: bool,
    /// The strategy that was used.
    pub strategy: MergeStrategy,
    /// Status message or error details.
    pub message: String,
    /// The SHA of the merge commit, if one was created.
    pub commit_sha: Option<String>,
}

/// Simulate a merge without modifying the working directory.
///
/// Uses `git merge-tree` to test the merge in advance and detect conflicts.
/// Works with all merge strategies by adapting the simulation.
#[instrument(skip_all, fields(repo = %repo, source = %source, target = %target))]
pub fn merge_dry_run(
    repo: &RepoPath,
    source: &str,
    target: &str,
    strategy: &MergeStrategy,
) -> Result<MergeDryRunResult, WorktreeError> {
    let repo_path = repo.as_path();

    // For all strategies, we use merge-tree to detect conflicts
    let merge_output = run_git(repo_path, &["merge-tree", "--write-tree", source, target])
        .unwrap_or_else(|_| String::new());

    let will_conflict = merge_output.contains("CONFLICT");
    let conflicting_files = parse_conflicting_files(&merge_output);

    // Get file change statistics
    let stat_output = run_git(repo_path, &["diff", "--stat", target, source])
        .unwrap_or_else(|_| String::new());
    let (files_changed, insertions, deletions) = parse_diff_stat(&stat_output);

    Ok(MergeDryRunResult {
        will_conflict,
        conflicting_files,
        files_changed,
        insertions,
        deletions,
        strategy: *strategy,
    })
}

/// Execute a merge with the specified strategy.
///
/// This performs the actual merge operation, creating commits and handling conflicts
/// according to the selected strategy.
#[instrument(skip_all, fields(worktree = %wt, strategy = ?opts.strategy))]
pub fn merge_with_strategy(
    wt: &WorktreePath,
    opts: &MergeOptions,
) -> Result<MergeResult, WorktreeError> {
    let _start = Instant::now();
    let wt_path = wt.as_path();

    // Ensure we're on the target branch
    run_git(wt_path, &["checkout", &opts.target_branch])
        .map_err(|e| WorktreeError::Git {
            message: format!("Failed to checkout target branch: {}", e),
        })?;

    let merge_result = match opts.strategy {
        MergeStrategy::Merge => execute_merge(wt_path, &opts.source_branch, &opts.generate_message)?,
        MergeStrategy::Squash => execute_squash(wt_path, &opts.source_branch)?,
        MergeStrategy::Rebase => execute_rebase(wt_path, &opts.source_branch, &opts.target_branch)?,
        MergeStrategy::FastForward => {
            execute_fast_forward(wt_path, &opts.source_branch)?
        }
    };

    // Auto-cleanup source branch if requested and merge succeeded
    if opts.auto_cleanup && merge_result.success && !opts.source_branch.starts_with("origin/") {
        let _ = run_git(wt_path, &["branch", "-d", &opts.source_branch]);
    }

    Ok(MergeResult {
        success: merge_result.success,
        strategy: opts.strategy,
        message: merge_result.message,
        commit_sha: merge_result.commit_sha,
    })
}

/// Execute a standard merge (creates a merge commit).
fn execute_merge(
    wt_path: &std::path::Path,
    source_branch: &str,
    generate_message: &bool,
) -> Result<MergeResult, WorktreeError> {
    let mut args = vec!["merge"];

    if !generate_message {
        args.push("--no-edit");
    }

    args.push(source_branch);

    match run_git(wt_path, &args) {
        Ok(output) => {
            // Extract commit SHA if available
            let commit_sha = extract_commit_sha(&output);
            Ok(MergeResult {
                success: true,
                strategy: MergeStrategy::Merge,
                message: format!("Merged {} into current branch", source_branch),
                commit_sha,
            })
        }
        Err(e) => {
            // Check if we have conflicts
            if let Ok(status) = run_git(wt_path, &["status", "--porcelain"]) {
                if !status.is_empty() {
                    return Ok(MergeResult {
                        success: false,
                        strategy: MergeStrategy::Merge,
                        message: "Merge has conflicts, resolve them manually".to_string(),
                        commit_sha: None,
                    });
                }
            }
            Err(e)
        }
    }
}

/// Execute a squash merge (combine all commits into one).
fn execute_squash(
    wt_path: &std::path::Path,
    source_branch: &str,
) -> Result<MergeResult, WorktreeError> {
    // Merge with --squash
    run_git(wt_path, &["merge", "--squash", source_branch])
        .map_err(|e| WorktreeError::Git {
            message: format!("Squash merge failed: {}", e),
        })?;

    // Commit the squashed changes
    let commit_output = run_git(
        wt_path,
        &[
            "commit",
            "--no-edit",
            "-m",
            &format!("Squash merge {}", source_branch),
        ],
    ).map_err(|e| WorktreeError::Git {
        message: format!("Failed to commit squashed changes: {}", e),
    })?;

    let commit_sha = extract_commit_sha(&commit_output);

    Ok(MergeResult {
        success: true,
        strategy: MergeStrategy::Squash,
        message: format!("Squashed and merged {}", source_branch),
        commit_sha,
    })
}

/// Execute a rebase strategy (rebase source onto target, then merge).
fn execute_rebase(
    wt_path: &std::path::Path,
    source_branch: &str,
    target_branch: &str,
) -> Result<MergeResult, WorktreeError> {
    // Checkout source branch
    run_git(wt_path, &["checkout", source_branch])
        .map_err(|e| WorktreeError::Git {
            message: format!("Failed to checkout source branch: {}", e),
        })?;

    // Rebase onto target
    run_git(wt_path, &["rebase", target_branch])
        .map_err(|e| WorktreeError::Git {
            message: format!("Rebase failed: {}", e),
        })?;

    // Checkout target and fast-forward merge
    run_git(wt_path, &["checkout", target_branch])
        .map_err(|e| WorktreeError::Git {
            message: format!("Failed to checkout target branch: {}", e),
        })?;

    let merge_output = run_git(wt_path, &["merge", "--ff-only", source_branch])
        .map_err(|e| WorktreeError::Git {
            message: format!("Final merge failed: {}", e),
        })?;

    let commit_sha = extract_commit_sha(&merge_output);

    Ok(MergeResult {
        success: true,
        strategy: MergeStrategy::Rebase,
        message: format!("Rebased and merged {} onto {}", source_branch, target_branch),
        commit_sha,
    })
}

/// Execute a fast-forward merge (fails if not possible).
fn execute_fast_forward(
    wt_path: &std::path::Path,
    source_branch: &str,
) -> Result<MergeResult, WorktreeError> {
    match run_git(wt_path, &["merge", "--ff-only", source_branch]) {
        Ok(output) => {
            let commit_sha = extract_commit_sha(&output);
            Ok(MergeResult {
                success: true,
                strategy: MergeStrategy::FastForward,
                message: format!("Fast-forwarded to {}", source_branch),
                commit_sha,
            })
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("not possible to fast-forward") || msg.contains("diverged") {
                Ok(MergeResult {
                    success: false,
                    strategy: MergeStrategy::FastForward,
                    message: "Cannot fast-forward; branches have diverged".to_string(),
                    commit_sha: None,
                })
            } else {
                Err(e)
            }
        }
    }
}

/// Abort an ongoing merge or rebase.
#[instrument(skip_all, fields(worktree = %wt))]
pub fn abort_merge(wt: &WorktreePath) -> Result<(), WorktreeError> {
    let wt_path = wt.as_path();

    // Try merge abort first
    if let Ok(_) = run_git(wt_path, &["merge", "--abort"]) {
        return Ok(());
    }

    // Then try rebase abort
    if let Ok(_) = run_git(wt_path, &["rebase", "--abort"]) {
        return Ok(());
    }

    // If both fail, check if there's actually an ongoing merge/rebase
    Err(WorktreeError::Git {
        message: "No merge or rebase in progress".to_string(),
    })
}

/// Extract commit SHA from git output.
fn extract_commit_sha(output: &str) -> Option<String> {
    // Look for patterns like "[main abc1234] message"
    for line in output.lines() {
        if let Some(start) = line.find('[') {
            if let Some(end) = line[start..].find(']') {
                let bracketed = &line[start + 1..start + end];
                let parts: Vec<&str> = bracketed.split_whitespace().collect();
                if parts.len() >= 2 {
                    return Some(parts[1].to_string());
                }
            }
        }
    }
    None
}

/// Parse conflicting files from merge-tree output.
fn parse_conflicting_files(output: &str) -> Vec<String> {
    let mut files = Vec::new();
    for line in output.lines() {
        if line.contains("CONFLICT") {
            // Extract filename from conflict line
            if let Some(filename) = line.split_whitespace().last() {
                files.push(filename.to_string());
            }
        }
    }
    files
}

/// Parse diff --stat output to get file counts.
fn parse_diff_stat(output: &str) -> (u32, u32, u32) {
    let mut files_changed = 0u32;
    let mut insertions = 0u32;
    let mut deletions = 0u32;

    // Last line contains summary: "N files changed, X insertions(+), Y deletions(-)"
    for line in output.lines() {
        if line.contains("file") && line.contains("changed") {
            // Parse: "5 files changed, 42 insertions(+), 13 deletions(-)"
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(Ok(n)) = parts.get(0).map(|s| s.parse::<u32>()) {
                files_changed = n;
            }
            // Find insertions count
            for (idx, part) in parts.iter().enumerate() {
                if part.contains("insertion") {
                    if idx > 0 {
                        if let Ok(i) = parts[idx - 1].parse::<u32>() {
                            insertions = i;
                        }
                    }
                }
                if part.contains("deletion") {
                    if idx > 0 {
                        if let Ok(d) = parts[idx - 1].parse::<u32>() {
                            deletions = d;
                        }
                    }
                }
            }
        }
    }

    (files_changed, insertions, deletions)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_merge_strategy_enum() {
        assert_eq!(MergeStrategy::Merge, MergeStrategy::Merge);
        assert_ne!(MergeStrategy::Merge, MergeStrategy::Squash);
    }

    #[test]
    fn test_merge_options_structure() {
        let opts = MergeOptions {
            strategy: MergeStrategy::Merge,
            target_branch: "main".to_string(),
            source_branch: "feature/login".to_string(),
            auto_cleanup: true,
            generate_message: false,
        };

        assert_eq!(opts.target_branch, "main");
        assert_eq!(opts.source_branch, "feature/login");
        assert!(opts.auto_cleanup);
        assert!(!opts.generate_message);
    }

    #[test]
    fn test_merge_dry_run_result() {
        let result = MergeDryRunResult {
            will_conflict: false,
            conflicting_files: Vec::new(),
            files_changed: 5,
            insertions: 42,
            deletions: 13,
            strategy: MergeStrategy::Merge,
        };

        assert!(!result.will_conflict);
        assert_eq!(result.files_changed, 5);
        assert_eq!(result.insertions, 42);
        assert_eq!(result.deletions, 13);
    }

    #[test]
    fn test_merge_dry_run_result_with_conflicts() {
        let mut conflicting_files = Vec::new();
        conflicting_files.push("file1.txt".to_string());
        conflicting_files.push("file2.rs".to_string());

        let result = MergeDryRunResult {
            will_conflict: true,
            conflicting_files,
            files_changed: 3,
            insertions: 10,
            deletions: 5,
            strategy: MergeStrategy::Merge,
        };

        assert!(result.will_conflict);
        assert_eq!(result.conflicting_files.len(), 2);
    }

    #[test]
    fn test_merge_result_success() {
        let result = MergeResult {
            success: true,
            strategy: MergeStrategy::Merge,
            message: "Merged feature into main".to_string(),
            commit_sha: Some("abc1234567890def".to_string()),
        };

        assert!(result.success);
        assert!(result.commit_sha.is_some());
    }

    #[test]
    fn test_merge_result_failure() {
        let result = MergeResult {
            success: false,
            strategy: MergeStrategy::FastForward,
            message: "Cannot fast-forward; branches have diverged".to_string(),
            commit_sha: None,
        };

        assert!(!result.success);
        assert!(result.commit_sha.is_none());
    }

    #[test]
    fn test_extract_commit_sha() {
        let output = "[main abc1234] Merged feature branch\n 1 file changed\n";
        let sha = extract_commit_sha(output);
        assert_eq!(sha, Some("abc1234".to_string()));
    }

    #[test]
    fn test_extract_commit_sha_not_found() {
        let output = "Merge made by the 'recursive' strategy.\n file.txt | 2 ++\n";
        let sha = extract_commit_sha(output);
        assert!(sha.is_none());
    }

    #[test]
    fn test_parse_conflicting_files_empty() {
        let output = "Merge successful";
        let files = parse_conflicting_files(output);
        assert!(files.is_empty());
    }

    #[test]
    fn test_parse_diff_stat_basic() {
        let output = "file1.txt | 10 +++++\nfile2.rs  | 5 ---\n 2 files changed, 10 insertions(+), 5 deletions(-)\n";
        let (files, insertions, deletions) = parse_diff_stat(output);
        assert_eq!(files, 2);
        assert_eq!(insertions, 10);
        assert_eq!(deletions, 5);
    }

    #[test]
    fn test_parse_diff_stat_no_changes() {
        let output = " 0 files changed\n";
        let (files, insertions, deletions) = parse_diff_stat(output);
        assert_eq!(files, 0);
        assert_eq!(insertions, 0);
        assert_eq!(deletions, 0);
    }

    #[test]
    fn test_merge_options_all_strategies() {
        let strategies = vec![
            MergeStrategy::Merge,
            MergeStrategy::Squash,
            MergeStrategy::Rebase,
            MergeStrategy::FastForward,
        ];

        for strategy in strategies {
            let opts = MergeOptions {
                strategy,
                target_branch: "main".to_string(),
                source_branch: "feature".to_string(),
                auto_cleanup: false,
                generate_message: true,
            };
            assert_eq!(opts.strategy, strategy);
        }
    }
}
