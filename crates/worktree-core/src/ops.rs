use crate::{WorktreeError, copier, framework, git, herd};
use crate::paths::{RepoPath, WorktreePath};
use crate::result::{OpResult, Warning};
use std::path::Path;
use tracing::instrument;

/// Full worktree creation with config copying, Laravel optimization, and optional Herd link.
///
/// The primary operation (git worktree add) must succeed. Optional side-effects
/// (config copy, Laravel setup, Herd link) are best-effort and reported as warnings.
#[instrument(skip_all, fields(repo = %repo_path, branch = %branch))]
pub fn add_worktree_full(
    repo_path: &RepoPath,
    path: &Path,
    branch: &str,
    create_branch: bool,
    copy_configs: bool,
    new_db_name: Option<String>,
    assign_vite_port: bool,
    link_herd: bool,
    clone_db: bool,
) -> Result<OpResult<()>, WorktreeError> {
    git::add_worktree(repo_path, path, branch, create_branch)?;

    let mut warnings = Vec::new();

    if copy_configs {
        let path_str = path.to_str().unwrap_or("");
        if let Err(e) = copier::copy_project_configs(repo_path.as_str(), path_str) {
            log::warn!("Config copy failed for {}: {}", path_str, e);
            warnings.push(Warning::new("copy_configs", e.to_string()));
        }
    }

    if assign_vite_port || new_db_name.is_some() {
        let path_str = path.to_str().unwrap_or("");
        if let Err(e) = framework::apply_laravel_optimizations(path_str, new_db_name, assign_vite_port, clone_db) {
            log::warn!("Laravel optimization failed for {}: {}", path_str, e);
            warnings.push(Warning::new("laravel_optimize", e.to_string()));
        }
    }

    if link_herd {
        let project_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let path_str = path.to_str().unwrap_or("");
        if let Err(e) = herd::link(path_str, &project_name) {
            log::warn!("Herd link failed for {}: {}", project_name, e);
            warnings.push(Warning::new("herd_link", e.to_string()));
        }
    }

    Ok(OpResult::with_warnings((), warnings))
}

/// Remove worktree with best-effort Herd unlink first.
#[instrument(skip_all, fields(repo = %repo_path, path = %path))]
pub fn remove_worktree_full(
    repo_path: &RepoPath,
    path: &WorktreePath,
    force: bool,
) -> Result<OpResult<()>, WorktreeError> {
    let mut warnings = Vec::new();

    let project_name = path.as_path()
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    if let Err(e) = herd::unlink(path.as_str(), &project_name) {
        log::warn!("Herd unlink failed for {}: {}", project_name, e);
        warnings.push(Warning::new("herd_unlink", e.to_string()));
    }

    git::remove_worktree(repo_path, path, force)?;
    Ok(OpResult::with_warnings((), warnings))
}

/// Merge a branch into a target branch and clean up the worktree and branch.
#[instrument(skip_all, fields(repo = %repo_path, target = %target_branch, source = %branch_to_merge))]
pub fn merge_and_cleanup_full(
    repo_path: &RepoPath,
    wt_path: &WorktreePath,
    target_branch: &str,
    branch_to_merge: &str,
) -> Result<OpResult<()>, WorktreeError> {
    crate::inter_worktree::merge_branch_into(wt_path, target_branch, branch_to_merge)?;

    let remove_result = remove_worktree_full(repo_path, wt_path, true)?;

    git::delete_branch(repo_path, branch_to_merge, true)?;

    Ok(OpResult::with_warnings((), remove_result.warnings))
}
