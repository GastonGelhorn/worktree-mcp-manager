use crate::WorktreeError;
use crate::git::run_git;
use crate::paths::{RepoPath, WorktreePath};
use std::path::Path;
use std::process::Command;

/// Run a git command and return stdout. For commands where git writes informational
/// output to stderr (pull, push, fetch), use `run_git_combined` instead.
fn run_git_in(wt: &WorktreePath, args: &[&str]) -> Result<String, WorktreeError> {
    run_git(&wt.canonical()?, args)
}

/// Run a git command that may write useful output to stderr (e.g. pull, push, fetch).
/// Returns stdout on success; returns a combined error on failure.
fn run_git_combined(path: &Path, args: &[&str]) -> Result<String, WorktreeError> {
    let output = Command::new("git")
        .current_dir(path)
        .args(args)
        .output()
        .map_err(|e| WorktreeError::Git {
            message: format!("Failed to execute git: {}", e),
        })?;

    let out = String::from_utf8_lossy(&output.stdout).to_string();
    let err = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(WorktreeError::Git {
            message: if err.is_empty() { out } else { err },
        });
    }
    Ok(out)
}

pub fn grab_file(
    _repo: &RepoPath,
    target_wt: &WorktreePath,
    source_branch: &str,
    file_path: &str,
) -> Result<String, WorktreeError> {
    run_git_in(target_wt, &["checkout", source_branch, "--", file_path])?;
    Ok(format!("Successfully grabbed {} from {}", file_path, source_branch))
}

pub fn get_changes(wt: &WorktreePath) -> Result<String, WorktreeError> {
    run_git_in(wt, &["status", "--short"])
}

pub fn stage_files(wt: &WorktreePath, paths: &[String]) -> Result<(), WorktreeError> {
    if paths.is_empty() {
        return Ok(());
    }
    let dir = wt.canonical()?;
    let output = Command::new("git")
        .current_dir(&dir)
        .arg("add")
        .args(paths)
        .output()
        .map_err(|e| WorktreeError::Git {
            message: format!("Failed to stage: {}", e),
        })?;
    if !output.status.success() {
        return Err(WorktreeError::Git {
            message: String::from_utf8_lossy(&output.stderr).to_string(),
        });
    }
    Ok(())
}

pub fn unstage_files(wt: &WorktreePath, paths: &[String]) -> Result<(), WorktreeError> {
    if paths.is_empty() {
        return Ok(());
    }
    let dir = wt.canonical()?;
    let path_strs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    let mut args = vec!["reset", "HEAD"];
    args.extend(path_strs);
    run_git(&dir, &args)?;
    Ok(())
}

pub fn commit(wt: &WorktreePath, message: &str) -> Result<(), WorktreeError> {
    let dir = wt.canonical()?;
    let output = Command::new("git")
        .current_dir(&dir)
        .args(["commit", "-m", message])
        .output()
        .map_err(|e| WorktreeError::Git {
            message: format!("Failed to commit: {}", e),
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "Nothing to commit (no changes added to commit). Stage files first.".to_string()
        };
        return Err(WorktreeError::Git { message });
    }
    Ok(())
}

pub fn pull(wt: &WorktreePath) -> Result<String, WorktreeError> {
    run_git_combined(&wt.canonical()?, &["pull"])
}

pub fn push(wt: &WorktreePath) -> Result<String, WorktreeError> {
    run_git_combined(&wt.canonical()?, &["push"])
}

/// Merge a branch into the current branch of the given worktree.
pub fn merge_branch_into(
    wt: &WorktreePath,
    target_branch: &str,
    branch_to_merge: &str,
) -> Result<(), WorktreeError> {
    let dir = wt.canonical()?;

    for (args, desc) in [
        (vec!["checkout", target_branch], "checkout"),
        (vec!["merge", "--no-edit", branch_to_merge], "merge"),
    ] {
        if let Err(e) = run_git(&dir, &args) {
            return Err(WorktreeError::Git {
                message: format!("{} failed: {}", desc, e),
            });
        }
    }
    Ok(())
}

/// Fetch from remote (run from repo root / main worktree path).
pub fn fetch(repo: &RepoPath) -> Result<String, WorktreeError> {
    run_git_combined(repo.as_path(), &["fetch"])
}

/// Returns (old_content_from_HEAD, new_content_from_worktree) for a path.
/// Old is None for new files; new is None for deleted files.
pub fn get_file_diff_sides(wt: &WorktreePath, path: &str) -> Result<(Option<String>, Option<String>), WorktreeError> {
    if path.contains("..") {
        return Err(WorktreeError::Git {
            message: "Invalid path".to_string(),
        });
    }
    let dir = wt.canonical()?;
    let file_path = dir.join(path);

    let old_content = Command::new("git")
        .current_dir(&dir)
        .arg("show")
        .arg(format!("HEAD:{}", path))
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok());

    let new_content = std::fs::read_to_string(&file_path).ok();

    Ok((old_content, new_content))
}
