use crate::WorktreeError;
use crate::git::run_git;
use crate::section_inject;
use crate::constants::MCP_FIRST_BLOCK;
use std::fs;
use std::path::Path;

/// Section marker for the auto-generated worktree block. Replaced on each inject when file exists.
const CLAUDE_SECTION_MARKER: &str = "## Worktree context (auto)";

/// Generate a CLAUDE.md file in the worktree with rich context for AI agents.
/// If CLAUDE.md already exists, only the "Worktree context (auto)" section is replaced or appended;
/// the rest of the file is preserved.
pub fn inject_claude_context(
    worktree_path: &str,
    branch_name: &str,
    context_details: &str,
) -> Result<String, WorktreeError> {
    let base_path = Path::new(worktree_path);
    let claude_md_path = base_path.join("CLAUDE.md");

    let section_content = build_worktree_section(worktree_path, branch_name, context_details);

    let final_content = if claude_md_path.exists() {
        let existing = fs::read_to_string(&claude_md_path).map_err(|e| WorktreeError::Io {
            message: format!("Failed to read CLAUDE.md: {}", e),
        })?;
        section_inject::upsert_section(&existing, CLAUDE_SECTION_MARKER, &section_content, "## ")
    } else {
        // New file: start with the minimal MCP-first rule, then append the worktree context section.
        format!("{mcp}\n\n{section}", mcp = MCP_FIRST_BLOCK, section = section_content)
    };

    fs::write(&claude_md_path, &final_content).map_err(|e| WorktreeError::Io {
        message: format!("Failed to write CLAUDE.md: {}", e),
    })?;

    Ok(claude_md_path.to_string_lossy().to_string())
}

fn build_worktree_section(worktree_path: &str, branch_name: &str, context_details: &str) -> String {
    let diff_stat = get_diff_stat(worktree_path, branch_name);
    let changed_files = get_changed_files(worktree_path, branch_name);
    let uncommitted = get_uncommitted_summary(worktree_path);

    let mut content = String::new();
    content.push_str(CLAUDE_SECTION_MARKER);
    content.push_str("\n\n");
    content.push_str(&format!("**Branch:** `{}`\n", branch_name));
    content.push_str(&format!("**Path:** `{}`\n\n", worktree_path));

    if !context_details.is_empty() {
        content.push_str("### Task\n\n");
        content.push_str(context_details);
        content.push_str("\n\n");
    }

    if let Some(stat) = &diff_stat {
        if !stat.is_empty() {
            content.push_str("### Changes vs main branch\n\n");
            content.push_str("```\n");
            content.push_str(stat);
            content.push_str("\n```\n\n");
        }
    }

    if let Some(files) = &changed_files {
        if !files.is_empty() {
            content.push_str("### Changed files\n\n");
            for f in files {
                content.push_str(&format!("- `{}`\n", f));
            }
            content.push_str("\n");
        }
    }

    if let Some(uncommitted) = &uncommitted {
        if !uncommitted.is_empty() {
            content.push_str("### Uncommitted changes\n\n");
            content.push_str("```\n");
            content.push_str(uncommitted);
            content.push_str("\n```\n\n");
        }
    }

    content.push_str("### Guidelines\n\n");
    content.push_str("- This is an isolated git worktree — changes only affect this branch until merged.\n");
    content.push_str("- Review `git status` before committing or pushing.\n");
    content.push_str("- The main worktree is separate; coordinate merges carefully.\n");

    content
}


fn get_diff_stat(worktree_path: &str, branch: &str) -> Option<String> {
    // Try main, then master as base branch
    for base in &["main", "master"] {
        if branch == *base {
            return None; // No diff against self
        }
        if let Ok(output) = run_git(Path::new(worktree_path), &["diff", "--stat", &format!("{}...HEAD", base)]) {
            if !output.trim().is_empty() {
                return Some(output.trim().to_string());
            }
        }
    }
    None
}

fn get_changed_files(worktree_path: &str, branch: &str) -> Option<Vec<String>> {
    for base in &["main", "master"] {
        if branch == *base {
            return None;
        }
        if let Ok(output) = run_git(Path::new(worktree_path), &["diff", "--name-only", &format!("{}...HEAD", base)]) {
            let files: Vec<String> = output.lines().filter(|l| !l.is_empty()).map(|l| l.to_string()).collect();
            if !files.is_empty() {
                return Some(files);
            }
        }
    }
    None
}

fn get_uncommitted_summary(worktree_path: &str) -> Option<String> {
    if let Ok(output) = run_git(Path::new(worktree_path), &["status", "--short"]) {
        let trimmed = output.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    None
}
