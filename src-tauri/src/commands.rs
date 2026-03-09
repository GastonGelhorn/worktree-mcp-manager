use worktree_core::paths::{RepoPath, WorktreePath};
use worktree_core::git::{self, AheadBehind, Branch, CommitInfo, GraphCommit, StashEntry, Worktree};
use worktree_core::framework::FrameworkInfo;
use std::path::Path;
use std::process::Stdio;

#[tauri::command]
pub fn list_worktrees(repo_path: &str) -> Result<Vec<Worktree>, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    git::list_worktrees(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_worktree(
    repo_path: &str,
    path: &str,
    branch: &str,
    create_branch: bool,
    new_db_name: Option<String>,
    assign_vite_port: bool,
    copy_configs: bool,
    clone_db: bool,
) -> Result<(), String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    let path = Path::new(path);
    worktree_core::ops::add_worktree_full(
        &repo_path,
        path,
        branch,
        create_branch,
        copy_configs,
        new_db_name,
        assign_vite_port,
        false, // herd link handled separately by frontend
        clone_db,
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_worktree(repo_path: &str, path: &str, force: bool) -> Result<(), String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    let wt_path = WorktreePath::new(path).map_err(|e| e.to_string())?;
    worktree_core::ops::remove_worktree_full(&repo_path, &wt_path, force)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_branches(repo_path: &str) -> Result<Vec<Branch>, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    git::list_branches(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn herd_link(path: &str, project_name: &str) -> Result<(), String> {
    worktree_core::herd::link(path, project_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn herd_unlink(path: &str, project_name: &str) -> Result<(), String> {
    worktree_core::herd::unlink(path, project_name).map_err(|e| e.to_string())
}


#[tauri::command]
pub fn start_process(path: &str, command: &str) -> Result<(), String> {
    crate::process::start_process(path, command).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_process(path: &str) -> Result<(), String> {
    crate::process::stop_process(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_pr_url(repo_path: &str, branch: &str) -> Result<String, String> {
    worktree_core::pr::generate_pr_url(repo_path, branch).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn inject_prompt(wt_path: &str, branch: &str, context: &str) -> Result<(), String> {
    worktree_core::prompt::inject_prompt(wt_path, branch, context).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn inject_claude_context(wt_path: &str, branch: &str, context: &str) -> Result<String, String> {
    worktree_core::claude_context::inject_claude_context(wt_path, branch, context).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn grab_file(
    repo_path: &str,
    wt_path: &str,
    src_branch: &str,
    file: &str,
) -> Result<String, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    let wt_path = WorktreePath::new(wt_path).map_err(|e| e.to_string())?;
    worktree_core::inter_worktree::grab_file(&repo_path, &wt_path, src_branch, file)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_changes(wt_path: &str) -> Result<String, String> {
    let wt_path = WorktreePath::new(wt_path).map_err(|e| e.to_string())?;
    worktree_core::inter_worktree::get_changes(&wt_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stage_files(wt_path: &str, paths: Vec<String>) -> Result<(), String> {
    let wt_path = WorktreePath::new(wt_path).map_err(|e| e.to_string())?;
    worktree_core::inter_worktree::stage_files(&wt_path, &paths).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unstage_files(wt_path: &str, paths: Vec<String>) -> Result<(), String> {
    let wt_path = WorktreePath::new(wt_path).map_err(|e| e.to_string())?;
    worktree_core::inter_worktree::unstage_files(&wt_path, &paths).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn commit(wt_path: &str, message: &str) -> Result<(), String> {
    let wt_path = WorktreePath::new(wt_path).map_err(|e| e.to_string())?;
    worktree_core::inter_worktree::commit(&wt_path, message).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pull(wt_path: &str) -> Result<String, String> {
    let wt_path = WorktreePath::new(wt_path).map_err(|e| e.to_string())?;
    worktree_core::inter_worktree::pull(&wt_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_commit_template(template: &str) -> Result<(), String> {
    let home_dir = std::path::PathBuf::from(std::env::var("HOME").map_err(|_| "Could not determine HOME directory")?);
    let worktree_dir = home_dir.join(".worktree");
    if !worktree_dir.exists() {
        std::fs::create_dir_all(&worktree_dir).map_err(|e| format!("Failed to create ~/.worktree: {}", e))?;
    }
    let template_file = worktree_dir.join("commit_template.txt");
    std::fs::write(&template_file, template).map_err(|e| format!("Failed to save template: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn push(wt_path: &str) -> Result<String, String> {
    let wt_path = WorktreePath::new(wt_path).map_err(|e| e.to_string())?;
    worktree_core::inter_worktree::push(&wt_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fetch(repo_path: &str) -> Result<String, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    worktree_core::inter_worktree::fetch(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn merge_branch_into(
    wt_path: &str,
    target_branch: &str,
    branch_to_merge: &str,
) -> Result<(), String> {
    let wt_path = WorktreePath::new(wt_path).map_err(|e| e.to_string())?;
    worktree_core::inter_worktree::merge_branch_into(&wt_path, target_branch, branch_to_merge)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn merge_and_cleanup(
    repo_path: &str,
    wt_path: &str,
    target_branch: &str,
    branch_to_merge: &str,
) -> Result<(), String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    let wt_path = WorktreePath::new(wt_path).map_err(|e| e.to_string())?;
    worktree_core::ops::merge_and_cleanup_full(&repo_path, &wt_path, target_branch, branch_to_merge)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_file_diff_sides(wt_path: &str, path: &str) -> Result<(Option<String>, Option<String>), String> {
    let wt_path = WorktreePath::new(wt_path).map_err(|e| e.to_string())?;
    worktree_core::inter_worktree::get_file_diff_sides(&wt_path, path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_framework(path: &str) -> Result<FrameworkInfo, String> {
    worktree_core::framework::check_framework(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_last_commit(wt_path: &str) -> Result<CommitInfo, String> {
    let wt_path = WorktreePath::new(wt_path).map_err(|e| e.to_string())?;
    git::get_last_commit(&wt_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ahead_behind(wt_path: &str, branch: &str) -> Result<AheadBehind, String> {
    let wt_path = WorktreePath::new(wt_path).map_err(|e| e.to_string())?;
    git::get_ahead_behind(&wt_path, branch).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_branch_graph(repo_path: &str, max_commits: u32) -> Result<Vec<GraphCommit>, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    git::get_branch_graph(&repo_path, max_commits).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn scan_repos(dir_path: &str) -> Result<Vec<String>, String> {
    git::scan_repos(dir_path, 4).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_checkout(repo_path: &str, branch: &str) -> Result<(), String> {
    let repo_path = Path::new(repo_path);
    git::git_checkout(repo_path, branch).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_stash(repo_path: &str, message: &str) -> Result<String, String> {
    let repo_path = Path::new(repo_path);
    git::git_stash(repo_path, message).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn has_uncommitted_changes(repo_path: &str) -> Result<bool, String> {
    let repo_path = Path::new(repo_path);
    git::has_uncommitted_changes(repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_current_branch(repo_path: &str) -> Result<String, String> {
    let repo_path = Path::new(repo_path);
    git::get_current_branch(repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_stashes(repo_path: &str) -> Result<Vec<StashEntry>, String> {
    let repo_path = Path::new(repo_path);
    git::list_stashes(repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_stash_pop(repo_path: &str, index: u32) -> Result<String, String> {
    let repo_path = Path::new(repo_path);
    git::git_stash_pop(repo_path, index).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_stash_drop(repo_path: &str, index: u32) -> Result<(), String> {
    let repo_path = Path::new(repo_path);
    git::git_stash_drop(repo_path, index).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_branch(repo_path: &str, branch: &str, force: bool) -> Result<(), String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    git::delete_branch(&repo_path, branch, force).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_repo_fingerprint(repo_path: &str) -> Result<String, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    git::get_repo_fingerprint(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_in_cursor(path: &str) -> Result<(), String> {
    let path = Path::new(path);
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    if !canonical.is_dir() {
        return Err("Path is not a directory".to_string());
    }
    let home = std::env::var("HOME")
        .map_err(|_| "Could not determine HOME directory".to_string())?;
    let home = std::path::PathBuf::from(home);
    let home_canonical = home
        .canonicalize()
        .map_err(|e| format!("Invalid HOME path: {}", e))?;
    if !canonical.starts_with(&home_canonical) {
        return Err("Path must be under user home directory".to_string());
    }
    #[cfg(target_os = "macos")]
    let cursor_bin = "/Applications/Cursor.app/Contents/Resources/app/bin/cursor";
    #[cfg(not(target_os = "macos"))]
    let cursor_bin = "cursor";

    std::process::Command::new(cursor_bin)
        .arg(&canonical)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("Failed to open Cursor: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_worktree_state(wt_path: &str) -> Result<worktree_core::state::WorktreeState, String> {
    let wt_path = worktree_core::paths::WorktreePath::new(wt_path).map_err(|e| e.to_string())?;
    worktree_core::state::get_worktree_state(&wt_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_branch_integration(repo_path: &str, branch: &str, target: &str) -> Result<worktree_core::integration::IntegrationResult, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    worktree_core::integration::check_branch_integration(&repo_path, branch, target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn merge_with_strategy(repo_path: &str, wt_path: &str, target_branch: &str, source_branch: &str, strategy: &str, auto_cleanup: bool) -> Result<serde_json::Value, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    let wt_path = worktree_core::paths::WorktreePath::new(wt_path).map_err(|e| e.to_string())?;

    let merge_strategy = match strategy.to_lowercase().as_str() {
        "merge" => worktree_core::merge::MergeStrategy::Merge,
        "squash" => worktree_core::merge::MergeStrategy::Squash,
        "rebase" => worktree_core::merge::MergeStrategy::Rebase,
        "fastforward" | "fast-forward" => worktree_core::merge::MergeStrategy::FastForward,
        _ => return Err(format!("Unknown merge strategy: {}", strategy)),
    };

    let opts = worktree_core::merge::MergeOptions {
        strategy: merge_strategy,
        target_branch: target_branch.to_string(),
        source_branch: source_branch.to_string(),
        auto_cleanup,
        generate_message: true,
    };

    let result = worktree_core::merge::merge_with_strategy(&wt_path, &opts).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn merge_dry_run(repo_path: &str, source: &str, target: &str, strategy: &str) -> Result<worktree_core::merge::MergeDryRunResult, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;

    let merge_strategy = match strategy.to_lowercase().as_str() {
        "merge" => worktree_core::merge::MergeStrategy::Merge,
        "squash" => worktree_core::merge::MergeStrategy::Squash,
        "rebase" => worktree_core::merge::MergeStrategy::Rebase,
        "fastforward" | "fast-forward" => worktree_core::merge::MergeStrategy::FastForward,
        _ => return Err(format!("Unknown merge strategy: {}", strategy)),
    };

    worktree_core::merge::merge_dry_run(&repo_path, source, target, &merge_strategy).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn abort_merge(wt_path: &str) -> Result<(), String> {
    let wt_path = worktree_core::paths::WorktreePath::new(wt_path).map_err(|e| e.to_string())?;
    worktree_core::merge::abort_merge(&wt_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ci_status(repo_path: &str, branch: &str) -> Result<worktree_core::ci::CiResult, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    worktree_core::ci::get_ci_status(&repo_path, branch).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn predict_conflicts(repo_path: &str, branch: &str, target: &str) -> Result<worktree_core::conflict_prediction::ConflictPrediction, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    worktree_core::conflict_prediction::predict_conflicts(&repo_path, branch, target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn agent_claim_worktree(repo_path: &str, wt_path: &str, agent_id: &str, task: &str, estimated_duration: Option<String>) -> Result<worktree_core::agent_orchestration::ClaimResult, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    worktree_core::agent_orchestration::agent_claim_worktree(&repo_path, wt_path, agent_id, task, estimated_duration.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn agent_release_worktree(repo_path: &str, wt_path: &str, agent_id: &str) -> Result<(), String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    worktree_core::agent_orchestration::agent_release_worktree(&repo_path, wt_path, agent_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn agent_list_claims(repo_path: &str) -> Result<worktree_core::agent_orchestration::ClaimsFile, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    worktree_core::agent_orchestration::agent_list_claims(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn agent_heartbeat(repo_path: &str, wt_path: &str, agent_id: &str) -> Result<(), String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    worktree_core::agent_orchestration::agent_heartbeat(&repo_path, wt_path, agent_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_mcp_session_claims() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|_| "Could not determine HOME directory")?;
    let claims_path = std::path::PathBuf::from(home).join(".worktree-mcp").join("session-claims.json");

    if !claims_path.exists() {
        return Ok("{}".to_string());
    }

    std::fs::read_to_string(&claims_path)
        .map_err(|e| format!("Failed to read session claims: {}", e))
}

#[tauri::command]
pub fn suggest_worktree(repo_path: &str, task_description: &str) -> Result<worktree_core::task_router::TaskSuggestion, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    worktree_core::task_router::suggest_worktree(&repo_path, task_description).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn analyze_diff(repo_path: &str, branch: &str, target: &str) -> Result<worktree_core::diff_intelligence::DiffAnalysis, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    worktree_core::diff_intelligence::analyze_diff(&repo_path, branch, target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn inject_context_v2(wt_path: &str, branch: &str, depth: &str, target: &str) -> Result<worktree_core::context_v2::GeneratedContext, String> {
    let wt_path = worktree_core::paths::WorktreePath::new(wt_path).map_err(|e| e.to_string())?;

    let context_depth = match depth.to_lowercase().as_str() {
        "minimal" => worktree_core::context_v2::ContextDepth::Minimal,
        "standard" => worktree_core::context_v2::ContextDepth::Standard,
        "deep" => worktree_core::context_v2::ContextDepth::Deep,
        _ => return Err(format!("Unknown context depth: {}", depth)),
    };

    let context_target = match target.to_lowercase().as_str() {
        "claude" => worktree_core::context_v2::ContextTarget::Claude,
        "cursor" => worktree_core::context_v2::ContextTarget::Cursor,
        "antigravity" => worktree_core::context_v2::ContextTarget::Antigravity,
        "all" => worktree_core::context_v2::ContextTarget::All,
        _ => return Err(format!("Unknown context target: {}", target)),
    };

    let config = worktree_core::context_v2::ContextConfig {
        depth: context_depth,
        target: context_target,
        task_description: None,
    };

    worktree_core::context_v2::inject_context_v2(&wt_path, branch, &config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn discover_hooks(repo_path: &str) -> Result<Vec<worktree_core::hooks::HookDef>, String> {
    let repo_path = std::path::Path::new(repo_path);
    worktree_core::hooks::discover_hooks(repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resolve_shortcut(repo_path: &str, input: &str) -> Result<String, String> {
    let repo_path = RepoPath::new(repo_path).map_err(|e| e.to_string())?;
    worktree_core::shortcuts::resolve_shortcut(&repo_path, input).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn setup_all_ides(repo_path: &str) -> Result<Vec<worktree_core::ide_config::IdeSetupResult>, String> {
    // Resolve server path and CLI path using the same logic as register_mcp_server
    let arch = if cfg!(target_arch = "aarch64") { "aarch64" } else { "x86_64" };
    let (server_path, cli_path) = resolve_mcp_paths(arch)?;
    worktree_core::ide_config::setup_all_ides(repo_path, &server_path, cli_path.as_deref())
        .map_err(|e| e.to_string())
}

// In release builds, embed the bundled MCP server JS so the .app is self-contained
#[cfg(not(debug_assertions))]
const MCP_SERVER_BUNDLE: &str = include_str!("../../mcp-server/dist/index.mjs");

/// Find the `claude` CLI binary. macOS .app bundles don't inherit the user's
/// full shell PATH, so we check common install locations explicitly.
fn find_claude_cli() -> Result<String, String> {
    // 1. Check if it's already in PATH (works in dev / terminal launches)
    if let Ok(output) = std::process::Command::new("which")
        .arg("claude")
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Ok(path);
            }
        }
    }

    // 2. Common install locations on macOS / Linux
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{}/.claude/local/claude", home),
        format!("{}/.local/bin/claude", home),
        format!("{}/.npm-global/bin/claude", home),
        "/usr/local/bin/claude".to_string(),
        "/opt/homebrew/bin/claude".to_string(),
        format!("{}/.nvm/versions/node/default/bin/claude", home), // nvm
    ];

    for candidate in &candidates {
        if std::path::Path::new(candidate).exists() {
            return Ok(candidate.clone());
        }
    }

    // 3. Try via common node manager paths with glob-like check
    let nvm_dir = format!("{}/.nvm/versions/node", home);
    if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
        for entry in entries.flatten() {
            let bin = entry.path().join("bin").join("claude");
            if bin.exists() {
                return Ok(bin.to_string_lossy().to_string());
            }
        }
    }

    Err(
        "Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code\n\
         Or check https://docs.anthropic.com/en/docs/claude-code"
            .to_string(),
    )
}

#[tauri::command]
pub fn register_mcp_server(_app_handle: tauri::AppHandle) -> Result<String, String> {
    let claude_bin = find_claude_cli()?;

    let arch = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x86_64"
    };

    let (mcp_path_str, cli_path) = resolve_mcp_paths(arch)?;

    let mut args = vec![
        "mcp".to_string(),
        "add".to_string(),
        "--scope".to_string(),
        "user".to_string(),
    ];

    // Pass CLI binary path as env var so MCP server can find it
    if let Some(ref cli) = cli_path {
        args.push("-e".to_string());
        args.push(format!("WORKTREE_CLI_PATH={}", cli));
    }

    args.extend([
        "worktree-mcp".to_string(),
        "--".to_string(),
        "node".to_string(),
        mcp_path_str.clone(),
    ]);

    let status = std::process::Command::new(&claude_bin)
        .args(&args)
        .status()
        .map_err(|e| format!("Failed to execute claude at '{}': {}", claude_bin, e))?;

    if status.success() {
        Ok(format!(
            "MCP server registered successfully using: {}",
            mcp_path_str
        ))
    } else {
        Err(
            "'claude mcp add' failed. Make sure Claude Code is installed and up to date."
                .to_string(),
        )
    }
}

/// In dev: point to source files, CLI discovered automatically via target/debug/.
/// In prod: write embedded JS to ~/.worktree-mcp/, point to sidecar CLI.
#[allow(unused_variables)]
fn resolve_mcp_paths(arch: &str) -> Result<(String, Option<String>), String> {
    #[cfg(debug_assertions)]
    {
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Could not determine executable path: {}", e))?;
        let project_root = exe_path
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .ok_or("Could not determine project directory")?;
        let dev_mcp = project_root.join("mcp-server").join("index.js");
        if !dev_mcp.exists() {
            return Err(format!("MCP server not found at: {:?}", dev_mcp));
        }
        Ok((dev_mcp.to_string_lossy().to_string(), None))
    }

    #[cfg(not(debug_assertions))]
    {
        // Write embedded MCP server to a stable location
        let home = std::env::var("HOME").map_err(|_| "Could not determine HOME".to_string())?;
        let mcp_dir = std::path::PathBuf::from(&home).join(".worktree-mcp");
        std::fs::create_dir_all(&mcp_dir)
            .map_err(|e| format!("Could not create ~/.worktree-mcp: {}", e))?;
        let mcp_file = mcp_dir.join("server.mjs");
        std::fs::write(&mcp_file, MCP_SERVER_BUNDLE)
            .map_err(|e| format!("Could not write MCP server: {}", e))?;

        // CLI sidecar is next to the app executable
        let exe_dir = std::env::current_exe()
            .map_err(|e| format!("Could not determine executable path: {}", e))?
            .parent()
            .ok_or("Could not determine executable directory")?
            .to_path_buf();
        let sidecar = exe_dir.join(format!("worktree-cli-{}-apple-darwin", arch));

        let cli = if sidecar.exists() {
            Some(sidecar.to_string_lossy().to_string())
        } else {
            None
        };

        Ok((mcp_file.to_string_lossy().to_string(), cli))
    }
}

#[tauri::command]
pub fn list_workflows(_repo_path: &str) -> Result<Vec<worktree_core::workflows::WorkflowDef>, String> {
    worktree_core::workflows::list_all_workflows().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn execute_workflow(repo_path: &str, workflow_name: &str) -> Result<worktree_core::workflows::WorkflowResult, String> {
    let workflow = worktree_core::workflows::get_workflow(workflow_name)
        .map_err(|e| e.to_string())?;
    worktree_core::workflows::run_workflow(Path::new(repo_path), &workflow)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_workflow(workflow_json: &str) -> Result<(), String> {
    let workflow: worktree_core::workflows::WorkflowDef = serde_json::from_str(workflow_json)
        .map_err(|e| format!("Invalid workflow JSON: {}", e))?;
    worktree_core::workflows::save_custom_workflow(&workflow)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_workflow(name: &str) -> Result<(), String> {
    worktree_core::workflows::delete_custom_workflow(name)
        .map_err(|e| e.to_string())
}
