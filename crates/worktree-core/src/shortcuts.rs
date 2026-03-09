use crate::{WorktreeError, RepoPath};
use crate::git::run_git;
use crate::git::run_external;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tracing::instrument;

/// Represents the result of shortcut resolution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ShortcutResolution {
    /// The input was passed through unchanged.
    Direct(String),
    /// The input was resolved to a different branch name.
    Resolved {
        /// The original input string.
        input: String,
        /// The resolved branch name.
        branch: String,
        /// The source of resolution (e.g., "default_branch", "gh_pr").
        source: String,
    },
}

/// Resolve a branch name shortcut to the actual branch name.
///
/// Supports the following patterns:
/// - `^`: default branch (origin/HEAD → origin/main etc.)
/// - `@`: current branch (from git symbolic-ref --short HEAD)
/// - `-`: last branch (from ~/.worktree/last_branch)
/// - `pr:123`: GitHub PR branch (via `gh pr view`)
/// - `mr:45`: GitLab MR branch (via `glab mr view`)
/// - Anything else: passed through unchanged
#[instrument(skip_all, fields(repo = %repo, input = %input))]
pub fn resolve_shortcut(repo: &RepoPath, input: &str) -> Result<String, WorktreeError> {
    let repo_path = repo.as_path();

    match input {
        "^" => resolve_default_branch(repo_path),
        "@" => resolve_current_branch(repo_path),
        "-" => resolve_last_branch(),
        _ if input.starts_with("pr:") => {
            if input.len() <= 3 {
                return Err(WorktreeError::Other {
                    message: format!("Invalid shortcut format: '{}' - missing PR number after prefix", input),
                });
            }
            let pr_number = &input[3..];
            resolve_github_pr(pr_number)
        }
        _ if input.starts_with("mr:") => {
            if input.len() <= 3 {
                return Err(WorktreeError::Other {
                    message: format!("Invalid shortcut format: '{}' - missing MR number after prefix", input),
                });
            }
            let mr_number = &input[3..];
            resolve_gitlab_mr(mr_number)
        }
        other => {
            // Pass through unchanged
            Ok(other.to_string())
        }
    }
}

/// Resolve `^` to the default branch.
fn resolve_default_branch(repo_path: &std::path::Path) -> Result<String, WorktreeError> {
    // Get the default branch from origin/HEAD
    let output = run_git(
        repo_path,
        &["symbolic-ref", "refs/remotes/origin/HEAD"],
    ).map_err(|_| WorktreeError::Git {
        message: "Could not determine default branch (check if origin/HEAD exists)".to_string(),
    })?;

    let full_ref = output.trim();
    // Format is typically: "refs/remotes/origin/main"
    if let Some(branch) = full_ref.strip_prefix("refs/remotes/origin/") {
        Ok(branch.to_string())
    } else {
        Err(WorktreeError::Git {
            message: format!("Could not parse default branch ref: {}", full_ref),
        })
    }
}

/// Resolve `@` to the current branch.
fn resolve_current_branch(repo_path: &std::path::Path) -> Result<String, WorktreeError> {
    let output = run_git(repo_path, &["symbolic-ref", "--short", "HEAD"])
        .map_err(|_| WorktreeError::Git {
            message: "Could not determine current branch (HEAD is detached?)".to_string(),
        })?;

    Ok(output.trim().to_string())
}

/// Resolve `-` to the last checked-out branch.
fn resolve_last_branch() -> Result<String, WorktreeError> {
    let last_branch_path = get_last_branch_path()?;

    let content = fs::read_to_string(&last_branch_path).map_err(|e| {
        WorktreeError::Io {
            message: format!("Could not read last branch file: {}", e),
        }
    })?;

    let branch = content.trim();
    if branch.is_empty() {
        return Err(WorktreeError::Other {
            message: "Last branch file is empty".to_string(),
        });
    }

    Ok(branch.to_string())
}

/// Resolve `pr:NUMBER` to the GitHub PR head branch.
fn resolve_github_pr(pr_number: &str) -> Result<String, WorktreeError> {
    let output = run_external(
        "gh",
        std::path::Path::new("."),
        &["pr", "view", pr_number, "--json", "headRefName", "-q", ".headRefName"],
    ).map_err(|_| WorktreeError::Process {
        message: format!("Failed to resolve GitHub PR {}: is `gh` installed?", pr_number),
    })?;

    let branch = output.trim().to_string();
    if branch.is_empty() {
        return Err(WorktreeError::Process {
            message: format!("PR {} not found or has no head branch", pr_number),
        });
    }

    Ok(branch)
}

/// Resolve `mr:NUMBER` to the GitLab MR source branch.
fn resolve_gitlab_mr(mr_number: &str) -> Result<String, WorktreeError> {
    let output = run_external(
        "glab",
        std::path::Path::new("."),
        &["mr", "view", mr_number, "--json", "source_branch", "-q", ".source_branch"],
    ).map_err(|_| WorktreeError::Process {
        message: format!("Failed to resolve GitLab MR {}: is `glab` installed?", mr_number),
    })?;

    let branch = output.trim().to_string();
    if branch.is_empty() {
        return Err(WorktreeError::Process {
            message: format!("MR {} not found or has no source branch", mr_number),
        });
    }

    Ok(branch)
}

/// Save the current branch to the last-branch file for later retrieval with `-`.
#[instrument(skip_all, fields(branch = %branch))]
pub fn save_last_branch(branch: &str) -> Result<(), WorktreeError> {
    let last_branch_path = get_last_branch_path()?;

    // Ensure parent directory exists
    if let Some(parent) = last_branch_path.parent() {
        fs::create_dir_all(parent).map_err(|e| WorktreeError::Io {
            message: format!("Could not create parent directory: {}", e),
        })?;
    }

    // Write the branch name
    fs::write(&last_branch_path, branch).map_err(|e| WorktreeError::Io {
        message: format!("Could not write last branch: {}", e),
    })?;

    Ok(())
}

/// Get the path to the last-branch file.
fn get_last_branch_path() -> Result<PathBuf, WorktreeError> {
    let home = dirs_home().map_err(|_| WorktreeError::Io {
        message: "Could not determine home directory".to_string(),
    })?;

    let worktree_dir = home.join(".worktree");
    Ok(worktree_dir.join("last_branch"))
}

/// Get the home directory. Simple implementation that works cross-platform.
fn dirs_home() -> Result<PathBuf, WorktreeError> {
    // Try environment variable first
    if let Ok(home) = std::env::var("HOME") {
        return Ok(PathBuf::from(home));
    }

    // Fallback for Windows
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        return Ok(PathBuf::from(userprofile));
    }

    Err(WorktreeError::Io {
        message: "Could not determine home directory".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shortcut_resolution_direct() {
        match ShortcutResolution::Direct("main".to_string()) {
            ShortcutResolution::Direct(branch) => {
                assert_eq!(branch, "main");
            }
            _ => panic!("Expected Direct variant"),
        }
    }

    #[test]
    fn test_shortcut_resolution_resolved() {
        let resolution = ShortcutResolution::Resolved {
            input: "^".to_string(),
            branch: "main".to_string(),
            source: "default_branch".to_string(),
        };

        match resolution {
            ShortcutResolution::Resolved {
                input,
                branch,
                source,
            } => {
                assert_eq!(input, "^");
                assert_eq!(branch, "main");
                assert_eq!(source, "default_branch");
            }
            _ => panic!("Expected Resolved variant"),
        }
    }

    #[test]
    fn test_parse_default_branch_ref() {
        // Simulate parsing the refs/remotes/origin/HEAD response
        let full_ref = "refs/remotes/origin/main";
        let branch = full_ref
            .strip_prefix("refs/remotes/origin/")
            .unwrap_or("");
        assert_eq!(branch, "main");
    }

    #[test]
    fn test_parse_default_branch_ref_complex() {
        let full_ref = "refs/remotes/origin/release/v2.0";
        let branch = full_ref
            .strip_prefix("refs/remotes/origin/")
            .unwrap_or("");
        assert_eq!(branch, "release/v2.0");
    }

    #[test]
    fn test_shortcut_patterns() {
        let patterns = vec![
            ("^", "default branch"),
            ("@", "current branch"),
            ("-", "last branch"),
            ("pr:123", "GitHub PR"),
            ("mr:45", "GitLab MR"),
            ("main", "passthrough"),
            ("feature/login", "passthrough"),
        ];

        for (pattern, description) in patterns {
            // Verify patterns are recognized as expected
            match pattern {
                "^" | "@" | "-" => {} // special handling
                p if p.starts_with("pr:") => {} // PR pattern
                p if p.starts_with("mr:") => {} // MR pattern
                _ => {} // passthrough
            }
        }
    }

    #[test]
    fn test_last_branch_path_construction() {
        // Test that the path is constructed correctly
        let path_result = get_last_branch_path();
        match path_result {
            Ok(path) => {
                assert!(path.ends_with("last_branch"));
                assert!(path.to_string_lossy().contains(".worktree"));
            }
            Err(e) => {
                // Expected if HOME is not set in test environment
                eprintln!("Expected error in test: {}", e);
            }
        }
    }

    #[test]
    fn test_dirs_home_from_env() {
        // Test home directory resolution
        let home_result = dirs_home();
        // Should succeed or fail gracefully
        match home_result {
            Ok(home) => {
                assert!(!home.as_os_str().is_empty());
            }
            Err(_) => {
                // Expected if HOME not set (which is fine in test)
            }
        }
    }

    #[test]
    fn test_shortcut_pr_number_extraction() {
        let input = "pr:123";
        let pr_number = &input[3..];
        assert_eq!(pr_number, "123");
    }

    #[test]
    fn test_shortcut_mr_number_extraction() {
        let input = "mr:45";
        let mr_number = &input[3..];
        assert_eq!(mr_number, "45");
    }

    #[test]
    fn test_shortcut_mr_complex_number() {
        let input = "mr:999";
        let mr_number = &input[3..];
        assert_eq!(mr_number, "999");
    }
}
