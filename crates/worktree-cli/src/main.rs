use clap::Parser;
use worktree_core::{git, herd, pr, prompt, claude_context, ide_config, inter_worktree, copier, framework, process, ops, safety, state, integration, shortcuts, merge, ci, agent_orchestration, conflict_prediction, task_router, diff_intelligence, workflows, context_v2, hooks};

#[derive(Parser)]
#[command(name = "worktree-cli", version, about = "Git worktree manager CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(clap::Subcommand)]
enum Commands {
    /// List all worktrees in a repository
    ListWorktrees { repo_path: String },

    /// Create a new worktree
    AddWorktree {
        repo_path: String,
        path: String,
        branch: String,
        #[arg(long)]
        create_branch: bool,
        #[arg(long)]
        link_herd: bool,
        #[arg(long)]
        copy_configs: bool,
        #[arg(long)]
        new_db_name: Option<String>,
        #[arg(long)]
        assign_vite_port: bool,
        #[arg(long)]
        clone_db: bool,
    },

    /// Remove a worktree
    RemoveWorktree {
        repo_path: String,
        path: String,
        #[arg(long)]
        force: bool,
    },

    /// List all branches
    ListBranches { repo_path: String },

    /// Link a directory to Laravel Herd
    HerdLink { path: String, project_name: String },

    /// Unlink a directory from Laravel Herd
    HerdUnlink { path: String, project_name: String },

    /// Generate a PR URL for a branch
    GeneratePrUrl { repo_path: String, branch: String },

    /// Inject AI context into a worktree (.cursorrules)
    InjectPrompt {
        wt_path: String,
        branch: String,
        context: String,
    },

    /// Inject rich AI context into a worktree (CLAUDE.md with diff stats)
    InjectClaudeContext {
        wt_path: String,
        branch: String,
        #[arg(long, default_value = "")]
        context: String,
    },

    /// Checkout a file from another branch into a worktree
    GrabFile {
        repo_path: String,
        wt_path: String,
        src_branch: String,
        file: String,
    },

    /// Get uncommitted changes in a worktree
    GetChanges { wt_path: String },

    /// Stage files in a worktree (paths relative to worktree root)
    StageFiles {
        wt_path: String,
        paths: Vec<String>,
    },

    /// Unstage files in a worktree
    UnstageFiles {
        wt_path: String,
        paths: Vec<String>,
    },

    /// Commit staged changes in a worktree
    Commit {
        wt_path: String,
        #[arg(short, long)]
        message: String,
    },

    /// Pull in a worktree
    Pull { wt_path: String },

    /// Push from a worktree
    Push { wt_path: String },

    /// Fetch in repo (run from repo root)
    Fetch { repo_path: String },

    /// Get old (HEAD) and new (worktree) content for a file for diff view
    GetFileDiffSides { wt_path: String, path: String },

    /// Check what framework a project uses
    CheckFramework { path: String },

    /// Get the last commit info for a worktree
    GetLastCommit { wt_path: String },

    /// Get ahead/behind counts relative to origin
    GetAheadBehind { wt_path: String, branch: String },

    /// Get the commit graph for visualization
    GetBranchGraph {
        repo_path: String,
        #[arg(long, default_value = "80")]
        max_commits: u32,
    },

    /// Scan a directory for git repositories
    ScanRepos {
        dir_path: String,
        #[arg(long, default_value = "4")]
        max_depth: u32,
    },

    /// Checkout a branch
    GitCheckout { repo_path: String, branch: String },

    /// Stash changes
    GitStash {
        repo_path: String,
        #[arg(long, default_value = "")]
        message: String,
    },

    /// Check if there are uncommitted changes
    HasUncommittedChanges { repo_path: String },

    /// Get the current branch name
    GetCurrentBranch { repo_path: String },

    /// List all stashes
    ListStashes { repo_path: String },

    /// Pop a stash by index
    GitStashPop { repo_path: String, index: u32 },

    /// Drop a stash by index
    GitStashDrop { repo_path: String, index: u32 },

    /// Delete a branch
    DeleteBranch {
        repo_path: String,
        branch: String,
        #[arg(long)]
        force: bool,
    },

    /// Merge a worktree into another branch and delete it
    MergeAndCleanup {
        repo_path: String,
        wt_path: String,
        target_branch: String,
        branch: String,
    },

    /// Get a fingerprint of the repo state
    GetRepoFingerprint { repo_path: String },

    /// Run a hook command in a directory
    RunHook { path: String, command: String },

    /// Copy project configs between directories
    CopyConfigs { source: String, dest: String },

    /// Validate a directory path
    ValidatePath {
        path: String,
        #[arg(long)]
        under_home: bool,
    },

    /// Setup MCP server in all detected IDEs
    SetupAllIdes {
        repo_path: String,
        server_path: String,
        #[arg(long)]
        cli_path: Option<String>,
    },

    /// Get the current state of a worktree
    GetWorktreeState { wt_path: String },

    /// Check the integration level of a branch with a target
    CheckIntegration {
        repo_path: String,
        branch: String,
        target_branch: String,
    },

    /// Resolve a branch name shortcut
    ResolveShortcut { repo_path: String, input: String },

    /// Save the last checked-out branch
    SaveLastBranch { branch: String },

    /// Merge a worktree using a specific strategy
    MergeWorktree {
        repo_path: String,
        wt_path: String,
        target_branch: String,
        source_branch: String,
        strategy: String,
        #[arg(long)]
        dry_run: bool,
        #[arg(long)]
        auto_cleanup: bool,
    },

    /// Simulate a merge without modifying the working directory
    MergeDryRun {
        repo_path: String,
        source: String,
        target: String,
        strategy: String,
    },

    /// Abort an ongoing merge or rebase
    AbortMerge { wt_path: String },

    /// Get CI/CD status for a branch
    GetCiStatus { repo_path: String, branch: String },

    /// Detect the CI provider
    DetectCiProvider { repo_path: String },

    /// Claim a worktree for an agent
    AgentClaim {
        repo_path: String,
        wt_path: String,
        agent_id: String,
        task: String,
        #[arg(long)]
        duration: Option<String>,
    },

    /// Release a worktree claim
    AgentRelease {
        repo_path: String,
        wt_path: String,
        agent_id: String,
    },

    /// Send a heartbeat for an agent's claim
    AgentHeartbeat {
        repo_path: String,
        wt_path: String,
        agent_id: String,
    },

    /// List all active agent claims
    AgentListClaims { repo_path: String },

    /// Predict merge conflicts between branches
    PredictConflicts {
        repo_path: String,
        branch: String,
        target: String,
    },

    /// Suggest the best worktree for a task
    SuggestWorktree { repo_path: String, task_description: String },

    /// Analyze the diff between two branches
    AnalyzeDiff {
        repo_path: String,
        branch: String,
        target: String,
    },

    /// List all available workflows (built-in + custom)
    ListWorkflows {
        /// Repository path (unused, workflows are global)
        #[arg(default_value = "")]
        repo_path: String,
    },

    /// Run a named workflow in a worktree directory
    RunWorkflow {
        #[arg(long)]
        repo_path: String,
        #[arg(long)]
        name: String,
        #[arg(long)]
        working_dir: String,
    },

    /// Save a custom workflow
    SaveWorkflow {
        /// JSON-encoded WorkflowDef
        #[arg(long)]
        workflow_json: String,
    },

    /// Delete a custom workflow by name
    DeleteWorkflow {
        #[arg(long)]
        name: String,
    },

    /// Inject context into a worktree (v2)
    InjectContextV2 {
        wt_path: String,
        branch: String,
        #[arg(long, default_value = "standard")]
        depth: String,
        #[arg(long, default_value = "claude")]
        target: String,
    },

    /// List all hooks in a repository
    ListHooks { repo_path: String },

    /// Execute a lifecycle hook
    RunLifecycleHook {
        repo_path: String,
        hook_type: String,
        working_dir: String,
    },

    /// Copy shared files between source and target
    CopySharedFiles {
        source: String,
        target: String,
        #[arg(long)]
        strategy: Option<String>,
    },
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_env("WORKTREE_LOG")
        )
        .with_writer(std::io::stderr)
        .init();

    let cli = Cli::parse();

    let result: Result<serde_json::Value, String> = (|| -> Result<serde_json::Value, String> {
        let parse_repo = |p: &str| worktree_core::paths::RepoPath::new(p).map_err(|e: worktree_core::WorktreeError| e.to_string());
        let parse_wt = |p: &str| worktree_core::paths::WorktreePath::new(p).map_err(|e: worktree_core::WorktreeError| e.to_string());
        match cli.command {
        Commands::ListWorktrees { repo_path } => git::list_worktrees(&parse_repo(&repo_path)?)
            .map(|v| serde_json::to_value(v).unwrap())
            .map_err(|e| e.to_string()),

        Commands::AddWorktree {
            repo_path,
            path,
            branch,
            create_branch,
            link_herd,
            copy_configs,
            new_db_name,
            assign_vite_port,
            clone_db,
        } => ops::add_worktree_full(
            &parse_repo(&repo_path)?,
            std::path::Path::new(&path),
            &branch,
            create_branch,
            copy_configs,
            new_db_name,
            assign_vite_port,
            link_herd,
            clone_db,
        )
        .map(|r| serde_json::json!({"ok": true, "warnings": r.warnings}))
        .map_err(|e| e.to_string()),

        Commands::RemoveWorktree {
            repo_path,
            path,
            force,
        } => ops::remove_worktree_full(&parse_repo(&repo_path)?, &parse_wt(&path)?, force)
            .map(|r| serde_json::json!({"ok": true, "warnings": r.warnings}))
            .map_err(|e| e.to_string()),

        Commands::ListBranches { repo_path } => git::list_branches(&parse_repo(&repo_path)?)
            .map(|v| serde_json::to_value(v).unwrap())
            .map_err(|e| e.to_string()),

        Commands::HerdLink { path, project_name } => herd::link(&path, &project_name)
            .map(|_| serde_json::json!({"ok": true}))
            .map_err(|e| e.to_string()),

        Commands::HerdUnlink { path, project_name } => herd::unlink(&path, &project_name)
            .map(|_| serde_json::json!({"ok": true}))
            .map_err(|e| e.to_string()),

        Commands::GeneratePrUrl { repo_path, branch } => {
            pr::generate_pr_url(&repo_path, &branch)
                .map(|url| serde_json::json!({"url": url}))
                .map_err(|e| e.to_string())
        }

        Commands::InjectPrompt {
            wt_path,
            branch,
            context,
        } => prompt::inject_prompt(&wt_path, &branch, &context)
            .map(|_| serde_json::json!({"ok": true}))
            .map_err(|e| e.to_string()),

        Commands::InjectClaudeContext {
            wt_path,
            branch,
            context,
        } => claude_context::inject_claude_context(&wt_path, &branch, &context)
            .map(|path| serde_json::json!({"ok": true, "path": path}))
            .map_err(|e| e.to_string()),

        Commands::GrabFile {
            repo_path,
            wt_path,
            src_branch,
            file,
        } => inter_worktree::grab_file(&parse_repo(&repo_path)?, &parse_wt(&wt_path)?, &src_branch, &file)
            .map(|msg| serde_json::json!({"message": msg}))
            .map_err(|e| e.to_string()),

        Commands::GetChanges { wt_path } => inter_worktree::get_changes(&parse_wt(&wt_path)?)
            .map(|changes| serde_json::json!({"changes": changes}))
            .map_err(|e| e.to_string()),

        Commands::StageFiles { wt_path, paths } => inter_worktree::stage_files(&parse_wt(&wt_path)?, &paths)
            .map(|_| serde_json::json!({"ok": true}))
            .map_err(|e| e.to_string()),

        Commands::UnstageFiles { wt_path, paths } => inter_worktree::unstage_files(&parse_wt(&wt_path)?, &paths)
            .map(|_| serde_json::json!({"ok": true}))
            .map_err(|e| e.to_string()),

        Commands::Commit { wt_path, message } => inter_worktree::commit(&parse_wt(&wt_path)?, &message)
            .map(|_| serde_json::json!({"ok": true}))
            .map_err(|e| e.to_string()),

        Commands::Pull { wt_path } => inter_worktree::pull(&parse_wt(&wt_path)?)
            .map(|out| serde_json::json!({"output": out}))
            .map_err(|e| e.to_string()),

        Commands::Push { wt_path } => inter_worktree::push(&parse_wt(&wt_path)?)
            .map(|out| serde_json::json!({"output": out}))
            .map_err(|e| e.to_string()),

        Commands::Fetch { repo_path } => inter_worktree::fetch(&parse_repo(&repo_path)?)
            .map(|out| serde_json::json!({"output": out}))
            .map_err(|e| e.to_string()),

        Commands::GetFileDiffSides { wt_path, path } => {
            inter_worktree::get_file_diff_sides(&parse_wt(&wt_path)?, &path)
                .map(|(old, new)| serde_json::json!({"old": old, "new": new}))
                .map_err(|e| e.to_string())
        }

        Commands::CheckFramework { path } => framework::check_framework(&path)
            .map(|v| serde_json::to_value(v).unwrap())
            .map_err(|e| e.to_string()),

        Commands::GetLastCommit { wt_path } => git::get_last_commit(&parse_wt(&wt_path)?)
            .map(|v| serde_json::to_value(v).unwrap())
            .map_err(|e| e.to_string()),

        Commands::GetAheadBehind { wt_path, branch } => {
            git::get_ahead_behind(&parse_wt(&wt_path)?, &branch)
                .map(|ab| serde_json::json!({"ahead": ab.ahead, "behind": ab.behind}))
                .map_err(|e| e.to_string())
        }

        Commands::GetBranchGraph {
            repo_path,
            max_commits,
        } => git::get_branch_graph(&parse_repo(&repo_path)?, max_commits)
            .map(|v| serde_json::to_value(v).unwrap())
            .map_err(|e| e.to_string()),

        Commands::ScanRepos {
            dir_path,
            max_depth,
        } => git::scan_repos(&dir_path, max_depth)
            .map(|v| serde_json::to_value(v).unwrap())
            .map_err(|e| e.to_string()),

        Commands::GitCheckout { repo_path, branch } => git::git_checkout(std::path::Path::new(&repo_path), &branch)
            .map(|_| serde_json::json!({"ok": true}))
            .map_err(|e| e.to_string()),

        Commands::GitStash { repo_path, message } => git::git_stash(std::path::Path::new(&repo_path), &message)
            .map(|output| serde_json::json!({"output": output}))
            .map_err(|e| e.to_string()),

        Commands::HasUncommittedChanges { repo_path } => {
            git::has_uncommitted_changes(std::path::Path::new(&repo_path))
                .map(|dirty| serde_json::json!({"has_changes": dirty}))
                .map_err(|e| e.to_string())
        }

        Commands::GetCurrentBranch { repo_path } => git::get_current_branch(std::path::Path::new(&repo_path))
            .map(|branch| serde_json::json!({"branch": branch}))
            .map_err(|e| e.to_string()),

        Commands::ListStashes { repo_path } => git::list_stashes(std::path::Path::new(&repo_path))
            .map(|v| serde_json::to_value(v).unwrap())
            .map_err(|e| e.to_string()),

        Commands::GitStashPop { repo_path, index } => git::git_stash_pop(std::path::Path::new(&repo_path), index)
            .map(|output| serde_json::json!({"output": output}))
            .map_err(|e| e.to_string()),

        Commands::GitStashDrop { repo_path, index } => git::git_stash_drop(std::path::Path::new(&repo_path), index)
            .map(|_| serde_json::json!({"ok": true}))
            .map_err(|e| e.to_string()),

        Commands::DeleteBranch {
            repo_path,
            branch,
            force,
        } => git::delete_branch(&parse_repo(&repo_path)?, &branch, force)
            .map(|_| serde_json::json!({"ok": true}))
            .map_err(|e| e.to_string()),

        Commands::MergeAndCleanup {
            repo_path,
            wt_path,
            target_branch,
            branch,
        } => ops::merge_and_cleanup_full(&parse_repo(&repo_path)?, &parse_wt(&wt_path)?, &target_branch, &branch)
            .map(|r| serde_json::json!({"ok": true, "warnings": r.warnings}))
            .map_err(|e| e.to_string()),

        Commands::GetRepoFingerprint { repo_path } => git::get_repo_fingerprint(&parse_repo(&repo_path)?)
            .map(|fp| serde_json::json!({"fingerprint": fp}))
            .map_err(|e| e.to_string()),

        Commands::RunHook { path, command } => process::run_hook(&path, &command)
            .map(|output| serde_json::json!({"output": output}))
            .map_err(|e| e.to_string()),

        Commands::CopyConfigs { source, dest } => copier::copy_project_configs(&source, &dest)
            .map(|_| serde_json::json!({"ok": true}))
            .map_err(|e| e.to_string()),

        Commands::ValidatePath { path, under_home } => {
            safety::resolve_safe_dir(&path, under_home)
                .map(|resolved| serde_json::json!({"resolved": resolved}))
                .map_err(|e| e.to_string())
        }

        Commands::SetupAllIdes { repo_path, server_path, cli_path } => {
            ide_config::setup_all_ides(&repo_path, &server_path, cli_path.as_deref())
                .map(|results| serde_json::to_value(results).unwrap())
                .map_err(|e| e.to_string())
        }

        Commands::GetWorktreeState { wt_path } => {
            state::get_worktree_state(&parse_wt(&wt_path)?)
                .map(|s| serde_json::to_value(s).unwrap())
                .map_err(|e| e.to_string())
        }

        Commands::CheckIntegration { repo_path, branch, target_branch } => {
            integration::check_branch_integration(&parse_repo(&repo_path)?, &branch, &target_branch)
                .map(|r| serde_json::to_value(r).unwrap())
                .map_err(|e| e.to_string())
        }

        Commands::ResolveShortcut { repo_path, input } => {
            shortcuts::resolve_shortcut(&parse_repo(&repo_path)?, &input)
                .map(|b| serde_json::json!({"resolved": b}))
                .map_err(|e| e.to_string())
        }

        Commands::SaveLastBranch { branch } => {
            shortcuts::save_last_branch(&branch)
                .map(|_| serde_json::json!({"ok": true}))
                .map_err(|e| e.to_string())
        }

        Commands::MergeWorktree { repo_path, wt_path, target_branch, source_branch, strategy, dry_run, auto_cleanup } => {
            if dry_run {
                // Parse strategy string to MergeStrategy enum
                let merge_strategy = match strategy.to_lowercase().as_str() {
                    "squash" => merge::MergeStrategy::Squash,
                    "rebase" => merge::MergeStrategy::Rebase,
                    "fast-forward" => merge::MergeStrategy::FastForward,
                    _ => merge::MergeStrategy::Merge,
                };
                merge::merge_dry_run(&parse_repo(&repo_path)?, &source_branch, &target_branch, &merge_strategy)
                    .map(|r| serde_json::to_value(r).unwrap())
                    .map_err(|e| e.to_string())
            } else {
                let merge_strategy = match strategy.to_lowercase().as_str() {
                    "squash" => merge::MergeStrategy::Squash,
                    "rebase" => merge::MergeStrategy::Rebase,
                    "fast-forward" => merge::MergeStrategy::FastForward,
                    _ => merge::MergeStrategy::Merge,
                };
                let opts = merge::MergeOptions {
                    strategy: merge_strategy,
                    target_branch,
                    source_branch,
                    auto_cleanup,
                    generate_message: true,
                };
                merge::merge_with_strategy(&parse_wt(&wt_path)?, &opts)
                    .map(|r| serde_json::to_value(r).unwrap())
                    .map_err(|e| e.to_string())
            }
        }

        Commands::MergeDryRun { repo_path, source, target, strategy } => {
            let merge_strategy = match strategy.to_lowercase().as_str() {
                "squash" => merge::MergeStrategy::Squash,
                "rebase" => merge::MergeStrategy::Rebase,
                "fast-forward" => merge::MergeStrategy::FastForward,
                _ => merge::MergeStrategy::Merge,
            };
            merge::merge_dry_run(&parse_repo(&repo_path)?, &source, &target, &merge_strategy)
                .map(|r| serde_json::to_value(r).unwrap())
                .map_err(|e| e.to_string())
        }

        Commands::AbortMerge { wt_path } => {
            merge::abort_merge(&parse_wt(&wt_path)?)
                .map(|_| serde_json::json!({"ok": true}))
                .map_err(|e| e.to_string())
        }

        Commands::GetCiStatus { repo_path, branch } => {
            ci::get_ci_status(&parse_repo(&repo_path)?, &branch)
                .map(|r| serde_json::to_value(r).unwrap())
                .map_err(|e| e.to_string())
        }

        Commands::DetectCiProvider { repo_path } => {
            ci::detect_provider(&parse_repo(&repo_path)?)
                .map(|p| serde_json::json!({"provider": format!("{:?}", p)}))
                .map_err(|e| e.to_string())
        }

        Commands::AgentClaim { repo_path, wt_path, agent_id, task, duration } => {
            agent_orchestration::agent_claim_worktree(&parse_repo(&repo_path)?, &wt_path, &agent_id, &task, duration.as_deref())
                .map(|r| serde_json::to_value(r).unwrap())
                .map_err(|e| e.to_string())
        }

        Commands::AgentRelease { repo_path, wt_path, agent_id } => {
            agent_orchestration::agent_release_worktree(&parse_repo(&repo_path)?, &wt_path, &agent_id)
                .map(|_| serde_json::json!({"ok": true}))
                .map_err(|e| e.to_string())
        }

        Commands::AgentHeartbeat { repo_path, wt_path, agent_id } => {
            agent_orchestration::agent_heartbeat(&parse_repo(&repo_path)?, &wt_path, &agent_id)
                .map(|_| serde_json::json!({"ok": true}))
                .map_err(|e| e.to_string())
        }

        Commands::AgentListClaims { repo_path } => {
            agent_orchestration::agent_list_claims(&parse_repo(&repo_path)?)
                .map(|c| serde_json::to_value(c).unwrap())
                .map_err(|e| e.to_string())
        }

        Commands::PredictConflicts { repo_path, branch, target } => {
            conflict_prediction::predict_conflicts(&parse_repo(&repo_path)?, &branch, &target)
                .map(|p| serde_json::to_value(p).unwrap())
                .map_err(|e| e.to_string())
        }

        Commands::SuggestWorktree { repo_path, task_description } => {
            task_router::suggest_worktree(&parse_repo(&repo_path)?, &task_description)
                .map(|s| serde_json::to_value(s).unwrap())
                .map_err(|e| e.to_string())
        }

        Commands::AnalyzeDiff { repo_path, branch, target } => {
            diff_intelligence::analyze_diff(&parse_repo(&repo_path)?, &branch, &target)
                .map(|a| serde_json::to_value(a).unwrap())
                .map_err(|e| e.to_string())
        }

        Commands::ListWorkflows { repo_path: _ } => {
            workflows::list_all_workflows()
                .map(|wfs| serde_json::to_value(wfs).unwrap())
                .map_err(|e| e.to_string())
        }

        Commands::RunWorkflow { repo_path: _, name, working_dir } => {
            let workflow = workflows::get_workflow(&name)
                .map_err(|e| e.to_string())?;
            workflows::run_workflow(std::path::Path::new(&working_dir), &workflow)
                .map(|r| serde_json::to_value(r).unwrap())
                .map_err(|e| e.to_string())
        }

        Commands::SaveWorkflow { workflow_json } => {
            let workflow: workflows::WorkflowDef = serde_json::from_str(&workflow_json)
                .map_err(|e| format!("Invalid workflow JSON: {}", e))?;
            workflows::save_custom_workflow(&workflow)
                .map(|_| serde_json::json!({"success": true}))
                .map_err(|e| e.to_string())
        }

        Commands::DeleteWorkflow { name } => {
            workflows::delete_custom_workflow(&name)
                .map(|_| serde_json::json!({"success": true}))
                .map_err(|e| e.to_string())
        }

        Commands::InjectContextV2 { wt_path, branch, depth, target } => {
            let depth_enum = match depth.to_lowercase().as_str() {
                "minimal" => context_v2::ContextDepth::Minimal,
                "deep" => context_v2::ContextDepth::Deep,
                _ => context_v2::ContextDepth::Standard,
            };
            let target_enum = match target.to_lowercase().as_str() {
                "cursor" => context_v2::ContextTarget::Cursor,
                "antigravity" => context_v2::ContextTarget::Antigravity,
                "all" => context_v2::ContextTarget::All,
                _ => context_v2::ContextTarget::Claude,
            };
            let config = context_v2::ContextConfig {
                depth: depth_enum,
                target: target_enum,
                task_description: None,
            };
            context_v2::inject_context_v2(&parse_wt(&wt_path)?, &branch, &config)
                .map(|c| serde_json::to_value(c).unwrap())
                .map_err(|e| e.to_string())
        }

        Commands::ListHooks { repo_path } => {
            hooks::list_hooks(std::path::Path::new(&repo_path))
                .map(|h| serde_json::to_value(h).unwrap())
                .map_err(|e| e.to_string())
        }

        Commands::RunLifecycleHook { repo_path, hook_type, working_dir } => {
            let hook_type_enum = match hook_type.to_lowercase().as_str() {
                "post-create" => hooks::HookType::PostCreate,
                "post-switch" => hooks::HookType::PostSwitch,
                "pre-merge" => hooks::HookType::PreMerge,
                "post-merge" => hooks::HookType::PostMerge,
                "pre-remove" => hooks::HookType::PreRemove,
                "post-remove" => hooks::HookType::PostRemove,
                _ => hooks::HookType::PostCreate,
            };
            let discovered = hooks::discover_hooks(std::path::Path::new(&repo_path)).map_err(|e| e.to_string())?;
            let matching_hooks: Vec<_> = discovered.iter()
                .filter(|h| h.hook_type == hook_type_enum)
                .collect();

            let mut results = Vec::new();
            for hook in matching_hooks {
                match hooks::execute_hook(hook, std::path::Path::new(&working_dir)) {
                    Ok(result) => results.push(result),
                    Err(e) => return Err(e.to_string()),
                }
            }
            Ok(serde_json::to_value(results).unwrap())
        }

        Commands::CopySharedFiles { source, target, strategy } => {
            // This command would integrate with the copier module
            // For now, delegate to the existing copier
            copier::copy_project_configs(&source, &target)
                .map(|_| serde_json::json!({"ok": true}))
                .map_err(|e| e.to_string())
        }
        }
    })();

    match result {
        Ok(value) => {
            println!("{}", serde_json::to_string(&value).unwrap());
        }
        Err(e) => {
            eprintln!("{}", serde_json::json!({"error": e}));
            std::process::exit(1);
        }
    }
}
