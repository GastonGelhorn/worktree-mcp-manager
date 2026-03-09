use std::process::Command;
use tempfile::TempDir;

/// Create a temporary git repository with an initial commit.
fn setup_test_repo() -> TempDir {
    let dir = TempDir::new().expect("Failed to create temp dir");
    let p = dir.path();

    Command::new("git").args(["init"]).current_dir(p).output().unwrap();
    Command::new("git").args(["config", "user.email", "test@test.com"]).current_dir(p).output().unwrap();
    Command::new("git").args(["config", "user.name", "Test"]).current_dir(p).output().unwrap();
    std::fs::write(p.join("README.md"), "# Test\n").unwrap();
    Command::new("git").args(["add", "."]).current_dir(p).output().unwrap();
    Command::new("git").args(["commit", "-m", "init"]).current_dir(p).output().unwrap();

    dir
}

#[test]
fn list_worktrees_returns_main() {
    let dir = setup_test_repo();
    let path_str = dir.path().to_str().unwrap();

    let wts = worktree_core::git::list_worktrees(&worktree_core::paths::RepoPath::new(path_str).unwrap()).unwrap();
    assert!(!wts.is_empty(), "Should have at least the main worktree");
    assert!(wts[0].path.contains(path_str) || !wts[0].path.is_empty());
    assert!(wts[0].branch.is_some(), "Main worktree should have a branch");
}

#[test]
fn add_and_remove_worktree_roundtrip() {
    let dir = setup_test_repo();
    let repo_path = dir.path().to_str().unwrap();
    let wt_path = dir.path().parent().unwrap().join("test-wt");
    let wt_str = wt_path.to_str().unwrap();

    // Add worktree
    worktree_core::git::add_worktree(&worktree_core::paths::RepoPath::new(repo_path).unwrap(), std::path::Path::new(wt_str), "test-branch", true).unwrap();

    // Verify it shows in the list
    let wts = worktree_core::git::list_worktrees(&worktree_core::paths::RepoPath::new(repo_path).unwrap()).unwrap();
    assert_eq!(wts.len(), 2, "Should have main + new worktree");
    let new_wt = wts.iter().find(|w| w.path.contains("test-wt"));
    assert!(new_wt.is_some(), "New worktree should be in the list");

    // Remove worktree
    worktree_core::git::remove_worktree(&worktree_core::paths::RepoPath::new(repo_path).unwrap(), &worktree_core::paths::WorktreePath::new(wt_str).unwrap(), false).unwrap();

    // Verify it's gone
    let wts = worktree_core::git::list_worktrees(&worktree_core::paths::RepoPath::new(repo_path).unwrap()).unwrap();
    assert_eq!(wts.len(), 1, "Should only have main worktree after removal");
}

#[test]
fn get_current_branch_returns_correct_branch() {
    let dir = setup_test_repo();
    let path_str = dir.path().to_str().unwrap();

    let branch = worktree_core::git::get_current_branch(std::path::Path::new(path_str)).unwrap();
    // Could be "main" or "master" depending on git config
    assert!(!branch.is_empty(), "Branch should not be empty");
}

#[test]
fn has_uncommitted_changes_detects_changes() {
    let dir = setup_test_repo();
    let path_str = dir.path().to_str().unwrap();

    // Clean state
    assert!(!worktree_core::git::has_uncommitted_changes(std::path::Path::new(path_str)).unwrap());

    // Create a change
    std::fs::write(dir.path().join("new_file.txt"), "hello").unwrap();

    // Dirty state
    assert!(worktree_core::git::has_uncommitted_changes(std::path::Path::new(path_str)).unwrap());
}

#[test]
fn list_branches_includes_current() {
    let dir = setup_test_repo();
    let path_str = dir.path().to_str().unwrap();

    let branches = worktree_core::git::list_branches(&worktree_core::paths::RepoPath::new(path_str).unwrap()).unwrap();
    let current = branches.iter().find(|b| b.is_current);
    assert!(current.is_some(), "Should have a current branch");
}

#[test]
fn get_changes_returns_status() {
    let dir = setup_test_repo();
    let path_str = dir.path().to_str().unwrap();

    // Clean — should be empty
    let changes = worktree_core::inter_worktree::get_changes(&worktree_core::paths::WorktreePath::new(path_str).unwrap()).unwrap();
    assert!(changes.trim().is_empty(), "No changes expected in clean repo");

    // Add untracked file
    std::fs::write(dir.path().join("untracked.txt"), "data").unwrap();
    let changes = worktree_core::inter_worktree::get_changes(&worktree_core::paths::WorktreePath::new(path_str).unwrap()).unwrap();
    assert!(changes.contains("untracked.txt"), "Should show untracked file");
}

#[test]
fn stage_and_commit_roundtrip() {
    let dir = setup_test_repo();
    let path_str = dir.path().to_str().unwrap();

    // Create a file
    std::fs::write(dir.path().join("feature.txt"), "feature content").unwrap();

    // Stage
    worktree_core::inter_worktree::stage_files(&worktree_core::paths::WorktreePath::new(path_str).unwrap(), &["feature.txt".to_string()]).unwrap();

    // Commit
    worktree_core::inter_worktree::commit(&worktree_core::paths::WorktreePath::new(path_str).unwrap(), "Add feature").unwrap();

    // Verify clean
    assert!(!worktree_core::git::has_uncommitted_changes(std::path::Path::new(path_str)).unwrap());

    // Verify last commit
    let info = worktree_core::git::get_last_commit(&worktree_core::paths::WorktreePath::new(path_str).unwrap()).unwrap();
    assert_eq!(info.message, "Add feature");
}

#[test]
fn delete_branch_removes_branch() {
    let dir = setup_test_repo();
    let repo_path = dir.path().to_str().unwrap();

    // Create a branch
    Command::new("git").args(["branch", "to-delete"]).current_dir(dir.path()).output().unwrap();

    let branches = worktree_core::git::list_branches(&worktree_core::paths::RepoPath::new(repo_path).unwrap()).unwrap();
    let has_branch = branches.iter().any(|b| b.name == "to-delete");
    assert!(has_branch, "Branch should exist before deletion");

    // Delete
    worktree_core::git::delete_branch(&worktree_core::paths::RepoPath::new(repo_path).unwrap(), "to-delete", false).unwrap();

    let branches = worktree_core::git::list_branches(&worktree_core::paths::RepoPath::new(repo_path).unwrap()).unwrap();
    let has_branch = branches.iter().any(|b| b.name == "to-delete");
    assert!(!has_branch, "Branch should be gone after deletion");
}

#[test]
fn repo_path_validates_real_directory() {
    let dir = setup_test_repo();
    let rp = worktree_core::RepoPath::new(dir.path().to_str().unwrap());
    assert!(rp.is_ok());
}

#[test]
fn scan_repos_finds_repo() {
    let parent = TempDir::new().unwrap();
    // Create a sub-repo inside
    let sub = parent.path().join("myrepo");
    std::fs::create_dir(&sub).unwrap();
    Command::new("git").args(["init"]).current_dir(&sub).output().unwrap();
    Command::new("git").args(["config", "user.email", "t@t.com"]).current_dir(&sub).output().unwrap();
    Command::new("git").args(["config", "user.name", "T"]).current_dir(&sub).output().unwrap();
    std::fs::write(sub.join("f.txt"), "x").unwrap();
    Command::new("git").args(["add", "."]).current_dir(&sub).output().unwrap();
    Command::new("git").args(["commit", "-m", "init"]).current_dir(&sub).output().unwrap();

    let repos = worktree_core::git::scan_repos(parent.path().to_str().unwrap(), 2).unwrap();
    assert!(!repos.is_empty(), "Should find the sub-repo");
}
