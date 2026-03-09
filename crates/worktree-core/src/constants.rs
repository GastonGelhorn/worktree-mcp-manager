/// Shared MCP instruction block injected into IDE context files.
/// Single source of truth — used by prompt.rs, claude_context.rs, and context_v2.rs.
pub const MCP_FIRST_BLOCK: &str = "\
## MCP-First (CRITICAL)\n\
\n\
For any git or worktree operation, you MUST use the `worktree-mcp` MCP tools instead of raw git/shell commands.\n\
Only use raw git when there is NO equivalent MCP tool, or for history-edit commands like `git rebase -i` / `git cherry-pick` and for build commands (npm/cargo/etc.).\n\
";
