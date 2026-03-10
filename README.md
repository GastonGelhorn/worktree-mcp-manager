# Worktree MCP Manager

AI-first git worktree manager with triple interface: native macOS app, CLI, and MCP server for AI agents.

Built in Rust + Tauri + React. Designed to let Claude Code, Cursor, and other AI agents manage git worktrees autonomously.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  worktree-core (Rust)             │
│  state · merge · ci · hooks · agent orchestration │
│  conflict prediction · diff intelligence · ...    │
└──────┬──────────────┬──────────────┬─────────────┘
       │              │              │
  ┌────▼────┐   ┌─────▼─────┐  ┌────▼────────┐
  │   CLI   │   │ Tauri GUI │  │ MCP Server  │
  │  (Rust) │   │  (React)  │  │ (TypeScript)│
  └─────────┘   └───────────┘  └─────────────┘
```

The three interfaces share the same Rust core library (`worktree-core`), so behavior is identical whether you use the GUI, the CLI, or an AI agent via MCP.

## Features

### Worktree Management
- Create, list, and remove git worktrees
- Automatic framework detection (Laravel, Node.js, Rust, etc.)
- Config file copying between worktrees with CoW (copy-on-write) on APFS
- Laravel Herd linking/unlinking for PHP projects
- Vite port auto-assignment to avoid conflicts

### Git Operations
- Stage, unstage, commit, pull, push, fetch
- Branch checkout, creation, and deletion
- Stash management (save, pop, drop, list)
- File grabbing between worktrees (cherry-pick individual files)
- Side-by-side diff viewing

### Merge & Integration
- Four merge strategies: merge, squash, rebase, fast-forward
- Dry-run merge preview (via `git merge-tree`, no working directory changes)
- Five-level branch integration check (SameCommit, Ancestor, NoAddedChanges, TreesMatch, MergeAddsNothing)
- Conflict prediction without touching the working directory
- Merge-and-cleanup: merge + remove worktree + delete branch in one operation

### AI Agent Orchestration
- Multi-agent worktree claiming with file-based locks (`.git/wt-agents.json`)
- Heartbeat protocol with automatic stale claim release (10min timeout)
- Task router: suggests the best worktree for a given task based on branch name relevance
- Diff intelligence: semantic analysis with risk scoring across 7 file categories
- Context injection for Claude (`.claude/context.md`) and Cursor (`.cursorrules`)

### CI/CD Integration
- GitHub Actions and GitLab CI status polling via `gh` and `glab` CLI
- PR/MR information: number, URL, mergeable state, review status
- Check status aggregation (pending, passing, failing)

### Workflows & Hooks
- Four built-in workflows: feature_complete, hotfix, daily_sync, review_prep
- Custom TOML workflow definitions (`~/.worktree/workflows/*.toml`)
- Sequential step execution with automatic project type detection
- Six lifecycle hooks: post-create, post-switch, pre-merge, post-merge, pre-remove, post-remove
- Background hook execution with logging

### Safety & HITL (Human-in-the-Loop)
- Destructive operations tagged with `[DANGER:DESTRUCTIVE]` in MCP tool descriptions
- Confirmation dialogs in the GUI for dangerous actions
- Audit logging of every MCP tool call (tool, args, success/failure, duration)
- Rate limiting (50 requests/5 seconds)
- Repository allowlist via `WORKTREE_ALLOWED_REPOS` environment variable

### GUI Features
- Multi-repo dashboard with repo scanning and conflict radar
- Branch graph visualization
- Grid, list, and table view modes
- CI status badges and worktree state indicators per worktree card
- Workflow execution panel (list, run, view results)
- Stash management panel (create, apply, drop)
- Agent claims monitoring panel
- Hooks manager in settings
- Command palette (Cmd+K)
- Light/dark theme with persistence
- Smart auto-refresh via git fingerprint polling (3s interval, reloads only on changes)
- LLM commit template management

## Prerequisites

- **Rust** stable (via [rustup](https://rustup.rs))
- **Node.js** >= 18 (with npm)

For CI status features (optional):
- GitHub CLI (`gh`) for GitHub repos
- GitLab CLI (`glab`) for GitLab repos

## Installation

Both options start by cloning the repository and installing dependencies:

```bash
git clone https://github.com/GastonGelhorn/worktree-mcp-manager.git
cd worktree-mcp-manager
npm install
cd mcp-server && npm install && cd ..
```

### Option A -- Production build (Recommended)

```bash
npm run tauri build
```

This compiles the Rust CLI, bundles the MCP server, builds the React frontend, and packages everything into a macOS app.

After the build completes:

- **App:** `target/release/bundle/macos/Worktree MCP Manager.app` -- drag to `/Applications`
- **DMG:** `target/release/bundle/dmg/Worktree MCP Manager_0.1.0_aarch64.dmg` (Not used)

The installed app bundles its own MCP server binary at:

```
/Applications/Worktree MCP Manager.app/Contents/MacOS/mcp-server
```

### Option B -- Development mode

```bash
npm run tauri dev
```

Compiles the Rust CLI in debug mode, starts Vite with hot-reload, and opens the Tauri window. Frontend changes reflect instantly; Rust changes require a restart.

In dev mode the MCP server runs via Node directly:

```
node mcp-server/index.js
```

### Tests

```bash
npm test              # Frontend tests (Vitest)
npm run test:mcp      # MCP server tests
npm run test:all      # Both
cargo test            # Rust core + CLI tests
```

## MCP Server Setup

The MCP server exposes 62 tools over stdio that let AI agents (Claude Code, Cursor, and others) control worktrees programmatically.

Where the MCP server binary lives depends on how you installed:

| Installation | MCP server command |
|---|---|
| Production build (Option A) | `/Applications/Worktree MCP Manager.app/Contents/MacOS/mcp-server` |
| Development mode (Option B) | `node mcp-server/index.js` |

### Cursor

**Global (`~/.cursor/mcp.json`) -- recommended after a production build**

Add the following to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "worktree-manager": {
      "command": "/Applications/Worktree MCP Manager.app/Contents/MacOS/mcp-server",
      "args": []
    }
  }
}
```

If you are running in dev mode instead, replace the command with `node` and pass the path to the entrypoint:

```json
{
  "mcpServers": {
    "worktree-manager": {
      "command": "node",
      "args": ["/absolute/path/to/worktree-mcp-manager/mcp-server/index.js"]
    }
  }
}
```

**Project-local (when working inside this repo)**

Already configured. This repo includes a `.cursor/mcp.json` that Cursor reads automatically when you open the project. No extra setup needed.

### Claude Code

**Global -- recommended after a production build**

```bash
claude mcp add worktree-manager /Applications/Worktree\ MCP\ Manager.app/Contents/MacOS/mcp-server
```

If you are running in dev mode instead:

```bash
claude mcp add worktree-manager node /absolute/path/to/worktree-mcp-manager/mcp-server/index.js
```

Verify with `claude mcp list`.

**Project-local (when working inside this repo)**

Already configured. The root `.mcp.json` declares the server so Claude Code picks it up automatically when you open the project.

### Laravel Herd MCP (separate service)

This project integrates with Laravel Herd (e.g. `herd_link` / `herd_unlink` tools), but **Herd's own MCP server is a separate service**. A "full" Herd MCP integration is typically **per-user/per-machine**, not something this repo can enable by itself.

- **You must install Laravel Herd and enable its MCP server** in your agent of choice (Claude Code and/or Cursor, etc.).
- **Project code changes are not required** to use Herd MCP; the configuration lives in your IDE/agent MCP settings and points to Herd's `.phar`, usually with `SITE_PATH` set to the project root.

Reference: [Herd docs — AI Integrations](https://herd.laravel.com/docs/macos/advanced-usage/ai-integrations)

**Claude Code**

```bash
claude mcp add herd php /Applications/Herd.app/Contents/Resources/herd-mcp.phar -e SITE_PATH="$(pwd)"
```

**Cursor**

Add a new MCP server (Cursor Settings → Tools & Integrations → New MCP Server) using a config like:

```json
{
  "herd": {
    "command": "php",
    "args": ["/Applications/Herd.app/Contents/Resources/herd-mcp.phar"],
    "env": { "SITE_PATH": "YOUR-SITE-PATH" }
  }
}
```

### Other agents

Any MCP-compatible agent can connect to the server over stdio. Point it to:

- **Production build:** `/Applications/Worktree MCP Manager.app/Contents/MacOS/mcp-server`
- **Dev mode:** `node mcp-server/index.js`

## MCP Tools Reference

62 tools organized in 7 modules:

### Worktree Tools (4)
| Tool | Description |
|------|-------------|
| `list_worktrees` | List all worktrees in a repository |
| `add_worktree` | Create a new worktree with optional framework setup |
| `remove_worktree` | Remove a worktree `[DANGER:DESTRUCTIVE]` |
| `get_worktree_state` | Get detailed state (clean/dirty/conflicts/rebasing/merging) |

### Git Tools (16)
| Tool | Description |
|------|-------------|
| `get_changes` | Show staged/unstaged changes |
| `stage_files` | Stage files for commit |
| `unstage_files` | Unstage files |
| `commit` | Create a commit |
| `pull` / `push` / `fetch` | Remote sync operations |
| `git_checkout` | Switch branches |
| `git_stash` | Create a stash |
| `git_stash_pop` | Apply and remove a stash |
| `git_stash_drop` | Delete a stash `[DANGER:DESTRUCTIVE]` |
| `list_stashes` | List all stashes |
| `delete_branch` | Delete a branch `[DANGER:DESTRUCTIVE]` |
| `grab_file` | Copy a file from another branch |
| `get_file_diff_sides` | Get before/after content for diffs |
| `resolve_shortcut` | Resolve branch shortcuts (`^`=default, `@`=current, `-`=last, `pr:N`) |

### Merge Tools (5)
| Tool | Description |
|------|-------------|
| `merge_worktree` | Merge with strategy selection `[DANGER:DESTRUCTIVE]` |
| `merge_dry_run` | Preview merge result without modifying anything |
| `merge_and_cleanup` | Merge + remove worktree + delete branch |
| `check_branch_integration` | Five-level branch integration check |
| `predict_conflicts` | Predict conflicts without touching the working directory |

### Agent Tools (4)
| Tool | Description |
|------|-------------|
| `agent_claim_worktree` | Claim exclusive access to a worktree |
| `agent_release_worktree` | Release a claimed worktree |
| `agent_list_claims` | List all active agent claims |
| `agent_heartbeat` | Refresh a claim's heartbeat |

### Utility Tools (22)
| Tool | Description |
|------|-------------|
| `list_branches` | List all branches |
| `check_framework` | Detect project framework |
| `get_last_commit` | Get last commit info |
| `get_ahead_behind` | Commits ahead/behind remote |
| `has_uncommitted_changes` | Quick dirty check |
| `get_current_branch` | Get current branch name |
| `get_branch_graph` | Visual branch history |
| `scan_repos` | Scan a directory for git repositories |
| `get_repo_fingerprint` | Fast change detection hash |
| `generate_pr_url` | Generate PR/MR URL for a branch |
| `inject_prompt` | Inject AI context (.cursorrules) |
| `inject_claude_context` | Inject Claude context (.claude/context.md) |
| `inject_context_v2` | Enhanced context injection (depth + target IDE) |
| `get_commit_template` | Get LLM commit message template |
| `save_commit_template` | Save LLM commit template |
| `get_ci_status` | Get CI/CD status for a branch (GitHub/GitLab) |
| `detect_ci_provider` | Detect CI provider for a repository |
| `analyze_diff` | Semantic diff analysis with risk scoring |
| `suggest_worktree` | AI task router — suggest best worktree for a task |
| `copy_shared_files` | Copy files between worktrees (CoW on APFS) |
| `open_in_cursor` | Open a path in Cursor IDE |
| `setup_all_ides` | Setup MCP config in all detected IDEs |

### Environment Tools (6)
| Tool | Description |
|------|-------------|
| `navigate_to_worktree` | Open a worktree in Finder/terminal |
| `open_in_editor` | Open a worktree in a specific editor |
| `start_process` / `stop_process` | Run/stop dev servers |
| `herd_link` / `herd_unlink` | Laravel Herd integration |

### Workflow Tools (5)
| Tool | Description |
|------|-------------|
| `list_workflows` | List available workflows (built-in + custom) |
| `run_workflow` | Execute a workflow by name `[WARNING:EXECUTION]` |
| `list_hooks` | List discovered lifecycle hooks |
| `run_hook` | Execute a hook manually `[WARNING:EXECUTION]` |
| `handoff_worktree` | Composite handoff operation between agents |

## Agent Usage Examples

These examples show how an AI coding agent (Cursor, Claude Code, etc.) is expected to interact with the Worktree MCP Manager server. Prompts are illustrative; the agent decides which tools to call.

### 1. Safe Git Commit via Agent

- **You say (in your editor/LLM)**:

  ```text
  I'm in /Users/me/code/my-repo. Use the worktree MCP tools to:
  - Show me what changed
  - Stage only the changes in src/components/SearchBar.tsx
  - Create a commit with a good Conventional Commit message
  ```

- **Agent will typically**:
  - Call `get_changes` to summarize staged/unstaged files.
  - Call `stage_files` with just `src/components/SearchBar.tsx`.
  - Call `get_commit_template` to format the message correctly.
  - Call `commit` (optionally with `allowUncommitted=false` to avoid committing with leftover changes).

### 2. Feature Branch Worktree for a Task

- **You say**:

  ```text
  Create an isolated worktree for a new feature branch "feat/search-refactor" from main,
  run the dev server, and then guide me through the files you change.
  Use the worktree MCP tools, not raw git commands.
  ```

- **Agent will typically**:
  - Use `list_worktrees` and `list_branches` to understand the current layout.
  - Call `add_worktree` with `baseBranch=main` and `branchName=feat/search-refactor`.
  - Call `start_process` to run the project-specific dev server in that worktree.
  - After edits, use `stage_files` + `get_commit_template` + `commit` to create one or more commits.

### 3. Human-in-the-Loop Merge & Cleanup

- **You say**:

  ```text
  In this repo, check if branch "feat/search-refactor" is safely integratable into main.
  If it merges cleanly, propose the plan first and, after I confirm, perform the merge
  and clean up the feature worktree using the MCP tools.
  ```

- **Agent will typically**:
  - Call `check_branch_integration` to understand integration status.
  - Call `merge_dry_run` to preview conflicts without touching the working directory.
  - Present you with a human-readable summary and ask for confirmation.
  - On approval, call `merge_and_cleanup` (or `merge_worktree` + `remove_worktree`) to apply the merge and tidy up.

### 4. Agent Handoff Between Worktrees

- **You say**:

  ```text
  Mark the current worktree as ready for review and hand it off so another agent
  can safely continue from here. Use the dedicated handoff/handoff-related tools.
  ```

- **Agent will typically**:
  - Ensure the worktree is clean (`has_uncommitted_changes`) or explicitly explain what remains.
  - Use `handoff_worktree` to perform the composite “ready for handoff” steps.
  - Optionally use `agent_claim_worktree` / `agent_release_worktree` so that only one agent modifies a worktree at a time.

## Project Structure

```
worktree/
├── crates/
│   ├── worktree-core/src/          # Rust core library (24 modules)
│   │   ├── state.rs                # Worktree state detection
│   │   ├── merge.rs                # Multi-strategy merge
│   │   ├── ci.rs                   # CI/CD status polling
│   │   ├── agent_orchestration.rs  # Multi-agent coordination
│   │   ├── conflict_prediction.rs  # Non-destructive conflict check
│   │   ├── task_router.rs          # AI task routing
│   │   ├── diff_intelligence.rs    # Semantic diff analysis
│   │   ├── workflows.rs            # Workflow engine
│   │   ├── hooks.rs                # Lifecycle hooks
│   │   ├── context_v2.rs           # AI context injection
│   │   ├── integration.rs          # Branch integration check
│   │   ├── shortcuts.rs            # Branch shortcut resolution
│   │   ├── git.rs                  # Git command execution
│   │   ├── copier.rs               # File copying with CoW
│   │   ├── herd.rs                 # Laravel Herd integration
│   │   ├── framework.rs            # Framework detection
│   │   └── ...
│   └── worktree-cli/               # CLI binary (clap)
├── src/                            # React frontend (Tauri)
│   ├── components/
│   │   ├── layout/                 # Header, Sidebar, MainPanel
│   │   ├── worktree/               # WorktreeGrid, MergeDialog, CiStatusBadge, ...
│   │   ├── agent/                  # AgentClaimsPanel
│   │   ├── workflow/               # WorkflowPanel (run/list workflows)
│   │   ├── git/                    # StashPanel (stash management)
│   │   ├── dashboard/              # Dashboard, ConflictRadar, StatCard
│   │   ├── graph/                  # BranchGraph, CommitDetailPanel
│   │   ├── settings/               # SettingsDrawer, HooksManager, TemplateManager
│   │   ├── sidebar/                # BranchTree, WorktreeList, RepoSelector
│   │   └── shared/                 # ConfirmDialog, CommandPalette, Toast, ...
│   ├── stores/                     # Zustand state (6 slices)
│   ├── lib/                        # Tauri command bindings, router, theme
│   └── types/                      # TypeScript interfaces
├── src-tauri/                      # Tauri backend (56 commands)
├── mcp-server/                     # MCP server (TypeScript)
│   ├── index.ts                    # Modular entry point
│   └── tools/                      # 7 tool modules (62 tools)
└── scripts/
    └── build-prod.sh               # Production build orchestrator
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WORKTREE_ALLOWED_REPOS` | Comma-separated list of allowed repo paths | All repos allowed |
| `WORKTREE_CLI_PATH` | Override path to the CLI binary | Auto-detected |

## Keyboard Shortcuts (GUI)

| Shortcut | Action |
|----------|--------|
| `Cmd+R` | Refresh data |
| `Cmd+1` / `Cmd+2` / `Cmd+3` | Grid / List / Table view |
| `Cmd+,` | Open settings |
| `Cmd+K` | Command palette |

## License

MIT
