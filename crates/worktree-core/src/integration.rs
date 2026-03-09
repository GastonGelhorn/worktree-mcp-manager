use crate::{WorktreeError, RepoPath};
use crate::git::run_git;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tracing::instrument;

/// Describes the integration level of a branch with a target.
///
/// Levels are ordered from most integrated to least integrated:
/// 1. SameCommit: The branch and target point to the same commit.
/// 2. Ancestor: The branch's history is a linear subset of the target's.
/// 3. NoAddedChanges: The branch has changes not in target, but merging adds no new commits.
/// 4. TreesMatch: The branch and target have different histories but same tree.
/// 5. MergeAddsNothing: A full merge would produce no changes.
/// 6. NotIntegrated: The branch has unintegrated changes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum IntegrationLevel {
    /// Both branch and target point to the exact same commit.
    SameCommit,
    /// Branch is an ancestor of target (all branch commits are in target).
    Ancestor,
    /// Branch is not an ancestor, but has no added changes beyond target.
    NoAddedChanges,
    /// Working trees match, but histories differ.
    TreesMatch,
    /// Merge would produce no new commits or changes.
    MergeAddsNothing,
    /// Branch has unintegrated changes.
    NotIntegrated,
}

/// Result of checking branch integration with a target branch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrationResult {
    /// The determined integration level.
    pub level: IntegrationLevel,
    /// Whether it is safe to delete the branch.
    pub safe_to_delete: bool,
    /// Human-readable explanation of the result.
    pub details: String,
    /// Number of commits the branch is ahead.
    pub ahead: u32,
    /// Number of commits the branch is behind.
    pub behind: u32,
    /// Time taken to determine integration in milliseconds.
    pub elapsed_ms: u64,
}

/// Check the integration level of a branch relative to a target.
///
/// This performs a series of checks in order, returning the first match.
/// Uses git rev-parse, merge-base, and merge-tree for accurate detection.
#[instrument(skip_all, fields(repo = %repo, branch = %branch, target = %target))]
pub fn check_branch_integration(
    repo: &RepoPath,
    branch: &str,
    target: &str,
) -> Result<IntegrationResult, WorktreeError> {
    let start = Instant::now();
    let repo_path = repo.as_path();

    // Get commit hashes
    let branch_sha = run_git(repo_path, &["rev-parse", branch])
        .map_err(|_| WorktreeError::Git {
            message: format!("Failed to resolve branch: {}", branch),
        })?
        .trim()
        .to_string();

    let target_sha = run_git(repo_path, &["rev-parse", target])
        .map_err(|_| WorktreeError::Git {
            message: format!("Failed to resolve target: {}", target),
        })?
        .trim()
        .to_string();

    // Compute ahead/behind
    let (ahead, behind) = get_ahead_behind(repo_path, branch, target)?;

    // Check 1: Same commit
    if branch_sha == target_sha {
        return Ok(IntegrationResult {
            level: IntegrationLevel::SameCommit,
            safe_to_delete: true,
            details: "Branch points to the same commit as target".to_string(),
            ahead,
            behind,
            elapsed_ms: start.elapsed().as_millis() as u64,
        });
    }

    // Check 2: Ancestor (branch is ancestor of target)
    if is_ancestor(repo_path, &branch_sha, &target_sha)? {
        return Ok(IntegrationResult {
            level: IntegrationLevel::Ancestor,
            safe_to_delete: true,
            details: "Branch is an ancestor of target (all branch commits are in target)".to_string(),
            ahead,
            behind,
            elapsed_ms: start.elapsed().as_millis() as u64,
        });
    }

    // Check 3: No added changes
    if check_no_added_changes(repo_path, branch, target)? {
        return Ok(IntegrationResult {
            level: IntegrationLevel::NoAddedChanges,
            safe_to_delete: true,
            details: "Branch has no changes beyond target".to_string(),
            ahead,
            behind,
            elapsed_ms: start.elapsed().as_millis() as u64,
        });
    }

    // Check 4: Trees match
    if check_trees_match(repo_path, branch, target)? {
        return Ok(IntegrationResult {
            level: IntegrationLevel::TreesMatch,
            safe_to_delete: true,
            details: "Working tree of branch matches target (different history)".to_string(),
            ahead,
            behind,
            elapsed_ms: start.elapsed().as_millis() as u64,
        });
    }

    // Check 5: Merge adds nothing
    if check_merge_adds_nothing(repo_path, branch, target)? {
        return Ok(IntegrationResult {
            level: IntegrationLevel::MergeAddsNothing,
            safe_to_delete: true,
            details: "Merging branch would add no new content".to_string(),
            ahead,
            behind,
            elapsed_ms: start.elapsed().as_millis() as u64,
        });
    }

    // Default: Not integrated
    Ok(IntegrationResult {
        level: IntegrationLevel::NotIntegrated,
        safe_to_delete: false,
        details: format!(
            "Branch {} has unintegrated changes ({} ahead, {} behind)",
            branch, ahead, behind
        ),
        ahead,
        behind,
        elapsed_ms: start.elapsed().as_millis() as u64,
    })
}

/// Check if branch_sha is an ancestor of target_sha.
fn is_ancestor(repo_path: &std::path::Path, branch_sha: &str, target_sha: &str) -> Result<bool, WorktreeError> {
    match run_git(
        repo_path,
        &["merge-base", "--is-ancestor", branch_sha, target_sha],
    ) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Check if branch has no added changes beyond target.
fn check_no_added_changes(
    repo_path: &std::path::Path,
    branch: &str,
    target: &str,
) -> Result<bool, WorktreeError> {
    match run_git(repo_path, &["diff", target, branch, "--stat"]) {
        Ok(output) => {
            // If diff is empty or only shows stats with no actual changes, there are no added changes
            Ok(output.trim().is_empty() || output.trim() == "0 files changed")
        }
        Err(_) => Ok(false),
    }
}

/// Check if the working tree (final state) is the same between branch and target.
fn check_trees_match(
    repo_path: &std::path::Path,
    branch: &str,
    target: &str,
) -> Result<bool, WorktreeError> {
    let branch_tree = match run_git(repo_path, &["rev-parse", &format!("{}^{{tree}}", branch)]) {
        Ok(output) => output.trim().to_string(),
        Err(_) => return Ok(false),
    };

    let target_tree = match run_git(repo_path, &["rev-parse", &format!("{}^{{tree}}", target)]) {
        Ok(output) => output.trim().to_string(),
        Err(_) => return Ok(false),
    };

    Ok(branch_tree == target_tree)
}

/// Check if merging branch into target would add nothing.
///
/// This uses git merge-tree (Git 2.38+) to simulate the merge without touching
/// the working directory. If the merge succeeds and no changes occur, the check passes.
fn check_merge_adds_nothing(
    repo_path: &std::path::Path,
    branch: &str,
    target: &str,
) -> Result<bool, WorktreeError> {
    // Try git merge-tree --write-tree
    match run_git(
        repo_path,
        &["merge-tree", "--write-tree", branch, target],
    ) {
        Ok(output) => {
            // Parse the output: first line is the tree SHA (or error)
            let result_tree = output.lines().next().unwrap_or("").trim();

            // Get the target tree
            let target_tree = match run_git(repo_path, &["rev-parse", &format!("{}^{{tree}}", target)]) {
                Ok(out) => out.trim().to_string(),
                Err(_) => return Ok(false),
            };

            // If the result tree matches the target tree, merge adds nothing
            Ok(result_tree == target_tree)
        }
        Err(_) => {
            // Fallback: merge-tree might not exist, use a different check
            // Try a three-way merge and check if there are conflicts or changes
            Ok(false)
        }
    }
}

/// Get the number of commits ahead and behind.
fn get_ahead_behind(
    repo_path: &std::path::Path,
    branch: &str,
    target: &str,
) -> Result<(u32, u32), WorktreeError> {
    match run_git(
        repo_path,
        &["rev-list", "--count", "--left-right", &format!("{}...{}", target, branch)],
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_integration_level_enum() {
        assert_eq!(IntegrationLevel::SameCommit, IntegrationLevel::SameCommit);
        assert_ne!(IntegrationLevel::SameCommit, IntegrationLevel::NotIntegrated);
    }

    #[test]
    fn test_integration_result_structure() {
        let result = IntegrationResult {
            level: IntegrationLevel::Ancestor,
            safe_to_delete: true,
            details: "Branch is an ancestor".to_string(),
            ahead: 0,
            behind: 5,
            elapsed_ms: 42,
        };

        assert_eq!(result.level, IntegrationLevel::Ancestor);
        assert!(result.safe_to_delete);
        assert_eq!(result.ahead, 0);
        assert_eq!(result.behind, 5);
        assert_eq!(result.elapsed_ms, 42);
    }

    #[test]
    fn test_integration_result_not_integrated() {
        let result = IntegrationResult {
            level: IntegrationLevel::NotIntegrated,
            safe_to_delete: false,
            details: "Has unintegrated changes".to_string(),
            ahead: 3,
            behind: 2,
            elapsed_ms: 100,
        };

        assert!(!result.safe_to_delete);
        assert_eq!(result.level, IntegrationLevel::NotIntegrated);
    }

    #[test]
    fn test_integration_result_safe_to_delete() {
        let safe_levels = vec![
            IntegrationLevel::SameCommit,
            IntegrationLevel::Ancestor,
            IntegrationLevel::NoAddedChanges,
            IntegrationLevel::TreesMatch,
            IntegrationLevel::MergeAddsNothing,
        ];

        for level in safe_levels {
            let result = IntegrationResult {
                level,
                safe_to_delete: true,
                details: "".to_string(),
                ahead: 0,
                behind: 0,
                elapsed_ms: 1,
            };
            assert!(result.safe_to_delete);
        }
    }

    #[test]
    fn test_integration_result_not_safe() {
        let result = IntegrationResult {
            level: IntegrationLevel::NotIntegrated,
            safe_to_delete: false,
            details: "".to_string(),
            ahead: 5,
            behind: 0,
            elapsed_ms: 1,
        };
        assert!(!result.safe_to_delete);
    }
}
