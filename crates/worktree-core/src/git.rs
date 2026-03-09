use crate::WorktreeError;
use crate::paths::{RepoPath, WorktreePath};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use tracing::instrument;

// ---------------------------------------------------------------------------
// Git command execution trait
// ---------------------------------------------------------------------------

/// Abstraction over git command execution.
///
/// Enables swapping the real implementation for a mock in tests, or wrapping
/// with caching/logging decorators without changing call sites.
pub trait GitRunner: Send + Sync {
    fn run(&self, dir: &Path, args: &[&str]) -> Result<String, WorktreeError>;
}

/// Production implementation that shells out to the `git` binary.
pub struct SystemGit;

impl GitRunner for SystemGit {
    fn run(&self, dir: &Path, args: &[&str]) -> Result<String, WorktreeError> {
        let output = Command::new("git")
            .current_dir(dir)
            .args(args)
            .output()
            .map_err(|e| WorktreeError::Git {
                message: format!("Failed to execute git: {}", e),
            })?;

        if !output.status.success() {
            return Err(WorktreeError::Git {
                message: String::from_utf8_lossy(&output.stderr).trim().to_string(),
            });
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

/// Run a non-git external command and return its stdout, or a typed error.
pub fn run_external(bin: &str, dir: &Path, args: &[&str]) -> Result<String, WorktreeError> {
    let output = Command::new(bin)
        .current_dir(dir)
        .args(args)
        .output()
        .map_err(|e| WorktreeError::Process {
            message: format!("Failed to execute {}: {}", bin, e),
        })?;

    if !output.status.success() {
        return Err(WorktreeError::Process {
            message: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// ---------------------------------------------------------------------------
// Backward-compatible convenience wrapper (used until all callers migrate)
// ---------------------------------------------------------------------------

fn git_error(msg: impl Into<String>) -> WorktreeError {
    WorktreeError::Git {
        message: msg.into(),
    }
}

pub(crate) fn run_git(path: &Path, args: &[&str]) -> Result<String, WorktreeError> {
    SystemGit.run(path, args)
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct Worktree {
    pub path: String,
    pub head: Option<String>,
    pub branch: Option<String>,
    pub is_detached: bool,
    pub is_locked: bool,
    pub prunable: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Branch {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AheadBehind {
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphCommit {
    pub hash: String,
    pub short_hash: String,
    pub parents: Vec<String>,
    pub branches: Vec<String>,
    pub message: String,
    pub author: String,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StashEntry {
    pub index: u32,
    pub message: String,
    pub branch: String,
}

pub fn parse_worktree_list(stdout: &str) -> Vec<Worktree> {
    let mut worktrees = Vec::new();
    let mut current_wt = None;

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            if let Some(wt) = current_wt.take() {
                worktrees.push(wt);
            }
            continue;
        }

        if let Some(wt_path) = line.strip_prefix("worktree ") {
            if let Some(wt) = current_wt.take() {
                worktrees.push(wt);
            }
            current_wt = Some(Worktree {
                path: wt_path.to_string(),
                head: None,
                branch: None,
                is_detached: false,
                is_locked: false,
                prunable: false,
            });
        } else if let Some(mut wt) = current_wt.take() {
            if let Some(head) = line.strip_prefix("HEAD ") {
                wt.head = Some(head.to_string());
            } else if let Some(branch) = line.strip_prefix("branch ") {
                wt.branch = Some(branch.to_string());
            } else if line == "detached" {
                wt.is_detached = true;
            } else if line.starts_with("locked") {
                wt.is_locked = true;
            } else if line.starts_with("prunable") {
                wt.prunable = true;
            }
            current_wt = Some(wt);
        }
    }

    if let Some(wt) = current_wt {
        worktrees.push(wt);
    }

    worktrees
}

#[instrument(skip_all, fields(repo = %repo_path))]
pub fn list_worktrees(repo_path: &RepoPath) -> Result<Vec<Worktree>, WorktreeError> {
    let stdout = run_git(repo_path.as_path(), &["worktree", "list", "--porcelain"])?;
    Ok(parse_worktree_list(&stdout))
}

#[instrument(skip_all, fields(repo = %repo_path, branch = %branch))]
pub fn add_worktree(
    repo_path: &RepoPath,
    path: &Path,
    branch: &str,
    create_branch: bool,
) -> Result<(), WorktreeError> {
    let mut cmd = Command::new("git");
    cmd.current_dir(repo_path.as_path()).arg("worktree").arg("add");

    if create_branch {
        cmd.arg("-b").arg(branch).arg(path.to_str().unwrap());
    } else {
        cmd.arg(path.to_str().unwrap()).arg(branch);
    }

    let output = cmd
        .output()
        .map_err(|e| git_error(format!("Failed to execute git command: {}", e)))?;

    if !output.status.success() {
        return Err(git_error(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(())
}

#[instrument(skip_all, fields(repo = %repo_path, path = %path))]
pub fn remove_worktree(repo_path: &RepoPath, path: &WorktreePath, force: bool) -> Result<(), WorktreeError> {
    let mut cmd = Command::new("git");
    cmd.current_dir(repo_path.as_path()).arg("worktree").arg("remove");

    if force {
        cmd.arg("--force");
    }

    cmd.arg(path.as_str());

    let output = cmd
        .output()
        .map_err(|e| git_error(format!("Failed to execute git command: {}", e)))?;

    if !output.status.success() {
        return Err(git_error(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(())
}

pub fn parse_branch_list(stdout: &str) -> Vec<Branch> {
    let mut branches = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 3 {
            branches.push(Branch {
                name: parts[1].to_string(),
                is_current: parts[0] == "*",
                is_remote: parts[2].starts_with("refs/remotes/"),
            });
        }
    }

    branches
}

pub fn list_branches(repo_path: &RepoPath) -> Result<Vec<Branch>, WorktreeError> {
    let stdout = run_git(
        repo_path.as_path(),
        &["branch", "--all", "--format=%(HEAD)|%(refname:short)|%(refname)"],
    )?;
    Ok(parse_branch_list(&stdout))
}

pub fn parse_commit_info(stdout: &str) -> Option<CommitInfo> {
    let line = stdout.trim();
    let parts: Vec<&str> = line.splitn(4, '|').collect();

    if parts.len() >= 4 {
        Some(CommitInfo {
            hash: parts[0].to_string(),
            message: parts[1].to_string(),
            author: parts[2].to_string(),
            date: parts[3].to_string(),
        })
    } else {
        None
    }
}

pub fn get_last_commit(wt_path: &WorktreePath) -> Result<CommitInfo, WorktreeError> {
    let stdout = run_git(wt_path.as_path(), &["log", "-1", "--format=%H|%s|%an|%ar"])?;
    parse_commit_info(&stdout).ok_or_else(|| git_error("Failed to parse commit info"))
}

pub fn parse_ahead_behind(stdout: &str) -> (u32, u32) {
    let parts: Vec<&str> = stdout.trim().split('\t').collect();
    if parts.len() == 2 {
        let behind = parts[0].parse::<u32>().unwrap_or(0);
        let ahead = parts[1].parse::<u32>().unwrap_or(0);
        (ahead, behind)
    } else {
        (0, 0)
    }
}

pub fn get_ahead_behind(wt_path: &WorktreePath, branch: &str) -> Result<AheadBehind, WorktreeError> {
    let output = Command::new("git")
        .current_dir(wt_path.as_path())
        .arg("rev-list")
        .arg("--left-right")
        .arg("--count")
        .arg(format!("origin/{}...{}", branch, branch))
        .output()
        .map_err(|e| git_error(format!("Failed to execute git command: {}", e)))?;

    if !output.status.success() {
        return Ok(AheadBehind { ahead: 0, behind: 0 });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let (ahead, behind) = parse_ahead_behind(&stdout);
    Ok(AheadBehind { ahead, behind })
}

pub fn parse_graph_output(stdout: &str) -> Vec<GraphCommit> {
    let mut commits = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.splitn(7, '|').collect();
        if parts.len() >= 7 {
            let parents: Vec<String> = if parts[2].is_empty() {
                Vec::new()
            } else {
                parts[2].split(' ').map(|s| s.to_string()).collect()
            };

            let branches: Vec<String> = if parts[3].is_empty() {
                Vec::new()
            } else {
                parts[3]
                    .split(", ")
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.starts_with("tag:"))
                    .collect()
            };

            commits.push(GraphCommit {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                parents,
                branches,
                message: parts[4].to_string(),
                author: parts[5].to_string(),
                date: parts[6].to_string(),
            });
        }
    }

    commits
}

pub fn get_branch_graph(
    repo_path: &RepoPath,
    max_commits: u32,
) -> Result<Vec<GraphCommit>, WorktreeError> {
    let stdout = run_git(
        repo_path.as_path(),
        &[
            "log",
            "--all",
            "--topo-order",
            &format!("-{}", max_commits),
            "--format=%H|%h|%P|%D|%s|%an|%ar",
        ],
    )?;
    Ok(parse_graph_output(&stdout))
}

pub fn scan_repos(dir_path: &str, max_depth: u32) -> Result<Vec<String>, WorktreeError> {
    let mut repos = Vec::new();

    // Check if the directory itself is a git repo
    let check_self = Command::new("git")
        .current_dir(dir_path)
        .arg("rev-parse")
        .arg("--git-dir")
        .output();

    if let Ok(output) = check_self {
        if output.status.success() {
            let root_output = Command::new("git")
                .current_dir(dir_path)
                .arg("rev-parse")
                .arg("--show-toplevel")
                .output();
            if let Ok(root) = root_output {
                if root.status.success() {
                    let root_path = String::from_utf8_lossy(&root.stdout).trim().to_string();
                    repos.push(root_path);
                    return Ok(repos);
                }
            }
        }
    }

    // Recursively scan subdirectories
    scan_repos_recursive(dir_path, max_depth, 0, &mut repos)?;
    repos.sort();
    Ok(repos)
}

fn scan_repos_recursive(
    dir_path: &str,
    max_depth: u32,
    current_depth: u32,
    repos: &mut Vec<String>,
) -> Result<(), WorktreeError> {
    if current_depth >= max_depth {
        return Ok(());
    }

    let entries = std::fs::read_dir(dir_path).map_err(|e| WorktreeError::Git {
        message: format!("Failed to read directory: {}", e),
    })?;

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            let name = entry.file_name();
            let name_str = name.to_string_lossy();

            // Skip hidden dirs and node_modules
            if name_str.starts_with('.') || name_str == "node_modules" || name_str == "vendor" {
                continue;
            }

            if path.is_dir() {
                let git_dir = path.join(".git");
                if git_dir.exists() {
                    if let Some(p) = path.to_str() {
                        repos.push(p.to_string());
                    }
                    // Don't recurse into git repos
                } else {
                    // Recurse deeper
                    if let Some(p) = path.to_str() {
                        scan_repos_recursive(p, max_depth, current_depth + 1, repos)?;
                    }
                }
            }
        }
    }

    Ok(())
}

pub fn git_checkout(path: &Path, branch: &str) -> Result<(), WorktreeError> {
    run_git(path, &["checkout", branch])?;
    Ok(())
}

pub fn git_stash(path: &Path, message: &str) -> Result<String, WorktreeError> {
    let mut args = vec!["stash", "push"];
    if !message.is_empty() {
        args.push("-m");
        args.push(message);
    }
    let stdout = run_git(path, &args)?;
    Ok(stdout.trim().to_string())
}

pub fn parse_stash_list(stdout: &str) -> Vec<StashEntry> {
    let mut stashes = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.splitn(3, '|').collect();
        if parts.len() >= 2 {
            let idx_str = parts[0].replace("stash@{", "").replace('}', "");
            let index = idx_str.parse::<u32>().unwrap_or(0);

            let stash_msg = parts[1];
            let branch = if stash_msg.contains(" on ") {
                stash_msg
                    .split(" on ")
                    .nth(1)
                    .unwrap_or("")
                    .split(':')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string()
            } else {
                String::new()
            };

            let message = if parts.len() >= 3 {
                parts[2].to_string()
            } else {
                stash_msg.to_string()
            };

            stashes.push(StashEntry {
                index,
                message,
                branch,
            });
        }
    }

    stashes
}

pub fn list_stashes(path: &Path) -> Result<Vec<StashEntry>, WorktreeError> {
    let output = Command::new("git")
        .current_dir(path)
        .args(["stash", "list", "--format=%gd|%gs|%s"])
        .output()
        .map_err(|e| git_error(format!("Failed to execute git command: {}", e)))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_stash_list(&stdout))
}

pub fn git_stash_pop(path: &Path, index: u32) -> Result<String, WorktreeError> {
    let stash_ref = format!("stash@{{{}}}", index);
    let stdout = run_git(path, &["stash", "pop", &stash_ref])?;
    Ok(stdout.trim().to_string())
}

pub fn git_stash_drop(path: &Path, index: u32) -> Result<(), WorktreeError> {
    let stash_ref = format!("stash@{{{}}}", index);
    run_git(path, &["stash", "drop", &stash_ref])?;
    Ok(())
}

pub fn has_uncommitted_changes(path: &Path) -> Result<bool, WorktreeError> {
    let stdout = run_git(path, &["status", "--porcelain"])?;
    Ok(!stdout.trim().is_empty())
}

pub fn get_current_branch(path: &Path) -> Result<String, WorktreeError> {
    let stdout = run_git(path, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    Ok(stdout.trim().to_string())
}

pub fn get_repo_fingerprint(repo_path: &RepoPath) -> Result<String, WorktreeError> {

    let git_dir = repo_path.as_path().join(".git");
    let git_dir = if git_dir.is_file() {
        if let Ok(content) = std::fs::read_to_string(&git_dir) {
            if let Some(path) = content.strip_prefix("gitdir: ") {
                std::path::PathBuf::from(path.trim())
            } else {
                git_dir
            }
        } else {
            git_dir
        }
    } else {
        git_dir
    };

    let mut parts = Vec::new();

    let files_to_check = [
        "HEAD",
        "refs/heads",
        "refs/stash",
        "worktrees",
        "index",
        "MERGE_HEAD",
        "REBASE_HEAD",
    ];

    for file in &files_to_check {
        let path = git_dir.join(file);
        if let Ok(meta) = std::fs::metadata(&path) {
            if let Ok(modified) = meta.modified() {
                let dur = modified
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default();
                parts.push(format!("{}:{}", file, dur.as_millis()));
            }
        }
    }

    let refs_heads = git_dir.join("refs/heads");
    if refs_heads.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&refs_heads) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    if let Ok(modified) = meta.modified() {
                        let dur = modified
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default();
                        parts.push(format!(
                            "ref:{}:{}",
                            entry.file_name().to_string_lossy(),
                            dur.as_millis()
                        ));
                    }
                }
            }
        }
    }
    Ok(parts.join("|"))
}

pub fn delete_branch(repo_path: &RepoPath, branch: &str, force: bool) -> Result<(), WorktreeError> {
    let flag = if force { "-D" } else { "-d" };
    run_git(repo_path.as_path(), &["branch", flag, branch])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_worktree_list_basic() {
        let input = "\
worktree /Users/dev/myproject
HEAD abc123def456
branch refs/heads/main

worktree /Users/dev/myproject-feature
HEAD 789abc012def
branch refs/heads/feature/login

";
        let wts = parse_worktree_list(input);
        assert_eq!(wts.len(), 2);
        assert_eq!(wts[0].path, "/Users/dev/myproject");
        assert_eq!(wts[0].head.as_deref(), Some("abc123def456"));
        assert_eq!(wts[0].branch.as_deref(), Some("refs/heads/main"));
        assert!(!wts[0].is_detached);
        assert!(!wts[0].is_locked);
        assert!(!wts[0].prunable);

        assert_eq!(wts[1].path, "/Users/dev/myproject-feature");
        assert_eq!(wts[1].branch.as_deref(), Some("refs/heads/feature/login"));
    }

    #[test]
    fn test_parse_worktree_list_detached_locked_prunable() {
        let input = "\
worktree /Users/dev/myproject
HEAD abc123
branch refs/heads/main

worktree /Users/dev/wt-detached
HEAD def456
detached

worktree /Users/dev/wt-locked
HEAD 789abc
branch refs/heads/locked-branch
locked

worktree /Users/dev/wt-prunable
HEAD aaa111
branch refs/heads/old
prunable
";
        let wts = parse_worktree_list(input);
        assert_eq!(wts.len(), 4);

        assert!(!wts[0].is_detached);
        assert!(wts[1].is_detached);
        assert!(wts[1].branch.is_none());
        assert!(wts[2].is_locked);
        assert!(wts[3].prunable);
    }

    #[test]
    fn test_parse_worktree_list_empty() {
        assert!(parse_worktree_list("").is_empty());
        assert!(parse_worktree_list("\n\n").is_empty());
    }

    #[test]
    fn test_parse_worktree_list_no_trailing_newline() {
        let input = "worktree /Users/dev/myproject\nHEAD abc123\nbranch refs/heads/main";
        let wts = parse_worktree_list(input);
        assert_eq!(wts.len(), 1);
        assert_eq!(wts[0].path, "/Users/dev/myproject");
    }

    #[test]
    fn test_parse_branch_list_basic() {
        let input = "\
*|main|refs/heads/main
 |feature/auth|refs/heads/feature/auth
 |origin/main|refs/remotes/origin/main
";
        let branches = parse_branch_list(input);
        assert_eq!(branches.len(), 3);
        assert_eq!(branches[0].name, "main");
        assert!(branches[0].is_current);
        assert!(!branches[0].is_remote);

        assert_eq!(branches[1].name, "feature/auth");
        assert!(!branches[1].is_current);
        assert!(!branches[1].is_remote);

        assert_eq!(branches[2].name, "origin/main");
        assert!(!branches[2].is_current);
        assert!(branches[2].is_remote);
    }

    #[test]
    fn test_parse_branch_list_empty() {
        assert!(parse_branch_list("").is_empty());
        assert!(parse_branch_list("\n\n").is_empty());
    }

    #[test]
    fn test_parse_commit_info_valid() {
        let input = "abc123def456|fix: resolve login bug|John Doe|2 hours ago";
        let ci = parse_commit_info(input).unwrap();
        assert_eq!(ci.hash, "abc123def456");
        assert_eq!(ci.message, "fix: resolve login bug");
        assert_eq!(ci.author, "John Doe");
        assert_eq!(ci.date, "2 hours ago");
    }

    #[test]
    fn test_parse_commit_info_with_pipes_in_message() {
        let input = "abc123|feat: add a|b support|Author|3 days ago";
        let ci = parse_commit_info(input).unwrap();
        assert_eq!(ci.hash, "abc123");
        assert_eq!(ci.message, "feat: add a");
        assert_eq!(ci.author, "b support");
        assert_eq!(ci.date, "Author|3 days ago");
    }

    #[test]
    fn test_parse_commit_info_invalid() {
        assert!(parse_commit_info("").is_none());
        assert!(parse_commit_info("just_a_hash").is_none());
        assert!(parse_commit_info("a|b").is_none());
    }

    #[test]
    fn test_parse_ahead_behind_basic() {
        assert_eq!(parse_ahead_behind("3\t5"), (5, 3));
        assert_eq!(parse_ahead_behind("0\t0"), (0, 0));
        assert_eq!(parse_ahead_behind("10\t2\n"), (2, 10));
    }

    #[test]
    fn test_parse_ahead_behind_malformed() {
        assert_eq!(parse_ahead_behind(""), (0, 0));
        assert_eq!(parse_ahead_behind("garbage"), (0, 0));
        assert_eq!(parse_ahead_behind("abc\tdef"), (0, 0));
    }

    #[test]
    fn test_parse_graph_output_basic() {
        let input = "\
abc123|abc1|parent1 parent2|HEAD -> main, origin/main|Initial commit|Alice|3 days ago
def456|def4||feature/login|Add login page|Bob|1 day ago
";
        let commits = parse_graph_output(input);
        assert_eq!(commits.len(), 2);

        assert_eq!(commits[0].hash, "abc123");
        assert_eq!(commits[0].short_hash, "abc1");
        assert_eq!(commits[0].parents, vec!["parent1", "parent2"]);
        assert_eq!(commits[0].branches, vec!["HEAD -> main", "origin/main"]);
        assert_eq!(commits[0].message, "Initial commit");
        assert_eq!(commits[0].author, "Alice");
        assert_eq!(commits[0].date, "3 days ago");

        assert_eq!(commits[1].parents.len(), 0);
        assert_eq!(commits[1].branches, vec!["feature/login"]);
    }

    #[test]
    fn test_parse_graph_output_filters_tags() {
        let input = "abc123|abc1||tag: v1.0, main|msg|Author|now\n";
        let commits = parse_graph_output(input);
        assert_eq!(commits[0].branches, vec!["main"]);
    }

    #[test]
    fn test_parse_graph_output_empty() {
        assert!(parse_graph_output("").is_empty());
        assert!(parse_graph_output("\n\n").is_empty());
    }

    #[test]
    fn test_parse_stash_list_basic() {
        // git stash list uses "WIP on <branch>:" or "On <branch>:" format
        // the parser looks for " on " to extract the branch
        let input = "\
stash@{0}|WIP on main: abc123|work in progress
stash@{1}|WIP on feature/auth: save state|partial work
";
        let stashes = parse_stash_list(input);
        assert_eq!(stashes.len(), 2);

        assert_eq!(stashes[0].index, 0);
        assert_eq!(stashes[0].message, "work in progress");
        assert_eq!(stashes[0].branch, "main");

        assert_eq!(stashes[1].index, 1);
        assert_eq!(stashes[1].message, "partial work");
        assert_eq!(stashes[1].branch, "feature/auth");
    }

    #[test]
    fn test_parse_stash_list_empty() {
        assert!(parse_stash_list("").is_empty());
        assert!(parse_stash_list("\n").is_empty());
    }

    #[test]
    fn test_parse_stash_list_no_branch_info() {
        let input = "stash@{0}|autostash|auto save\n";
        let stashes = parse_stash_list(input);
        assert_eq!(stashes.len(), 1);
        assert_eq!(stashes[0].branch, "");
        assert_eq!(stashes[0].message, "auto save");
    }
}
