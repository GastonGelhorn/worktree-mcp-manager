use crate::{WorktreeError, WorktreePath};
use crate::git::run_git;
use crate::constants::MCP_FIRST_BLOCK;
use serde::{Deserialize, Serialize};
use std::fs;
use tracing::instrument;

/// Depth of context to inject.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContextDepth {
    /// Only essential information (branch, basic diff)
    Minimal,
    /// Standard level: diff, related files, tests
    Standard,
    /// Comprehensive: everything including dependencies, conventions
    Deep,
}

/// Target AI tool for context injection.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContextTarget {
    /// Inject context for Claude
    Claude,
    /// Inject context for Cursor IDE
    Cursor,
    /// Inject context for Antigravity
    Antigravity,
    /// Inject context for all tools
    All,
}

/// Configuration for context injection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextConfig {
    /// How much context to include
    pub depth: ContextDepth,
    /// Which tools to target
    pub target: ContextTarget,
    /// Optional task description for context
    pub task_description: Option<String>,
}

/// Result of context injection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedContext {
    /// Paths to files that were written
    pub files_written: Vec<String>,
    /// Summary of what was included
    pub content_summary: String,
}

/// Get the diff between main and the current branch.
fn get_branch_diff(wt: &WorktreePath) -> Result<String, WorktreeError> {
    run_git(
        wt.as_path(),
        &["diff", "--stat", "main...HEAD"],
    )
}

/// Find test files related to changed files.
fn find_test_files(wt: &WorktreePath, changed_files: &[&str]) -> Result<Vec<String>, WorktreeError> {
    let mut test_files = Vec::new();

    for file in changed_files {
        // Look for corresponding test files
        let test_patterns = vec![
            format!("{}.test.js", file),
            format!("{}.test.ts", file),
            format!("{}.test.rs", file),
            format!("{}.spec.js", file),
            format!("{}.spec.ts", file),
        ];

        for pattern in test_patterns {
            let test_path = wt.as_path().join(&pattern);
            if test_path.exists() {
                test_files.push(pattern);
            }
        }
    }

    Ok(test_files)
}

/// Get CI status if available.
fn get_ci_status(_wt: &WorktreePath) -> Result<String, WorktreeError> {
    // This would integrate with CI systems like GitHub Actions, GitLab CI, etc.
    // For now, return placeholder
    Ok("CI integration not available".to_string())
}

/// Find project configuration files that define conventions.
fn find_project_conventions(wt: &WorktreePath) -> Result<Vec<String>, WorktreeError> {
    let mut conventions = Vec::new();

    let config_files = vec![
        ".editorconfig",
        ".eslintrc",
        ".eslintrc.json",
        ".prettierrc",
        ".prettierrc.json",
        "rustfmt.toml",
        "clippy.toml",
        ".flake8",
        "pyproject.toml",
        "Makefile",
        "build.gradle",
    ];

    for file in config_files {
        let path = wt.as_path().join(file);
        if path.exists() {
            conventions.push(file.to_string());
        }
    }

    Ok(conventions)
}

/// Generate minimal context: branch info and diff.
fn generate_minimal_context(wt: &WorktreePath) -> Result<String, WorktreeError> {
    let mut context = String::new();

    // Get current branch
    let branch = run_git(wt.as_path(), &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();

    context.push_str(&format!("# Branch\nCurrent branch: {}\n\n", branch));

    // Get diff summary
    let diff = get_branch_diff(wt)?;
    context.push_str("# Changes Summary\n");
    context.push_str(&diff);
    context.push('\n');

    Ok(context)
}

/// Generate standard context: diff, related files, tests.
fn generate_standard_context(wt: &WorktreePath, task: &Option<String>) -> Result<String, WorktreeError> {
    let mut context = generate_minimal_context(wt)?;

    // Add task description if provided
    if let Some(task_desc) = task {
        context.push_str(&format!("# Task\n{}\n\n", task_desc));
    }

    // Get changed files
    let output = run_git(
        wt.as_path(),
        &["diff", "--name-only", "main...HEAD"],
    )?;

    let changed_files: Vec<&str> = output.lines().collect();

    if !changed_files.is_empty() {
        context.push_str("# Changed Files\n");
        for file in &changed_files {
            context.push_str(&format!("- {}\n", file));
        }
        context.push('\n');

        // Find test files
        if let Ok(test_files) = find_test_files(wt, &changed_files) {
            if !test_files.is_empty() {
                context.push_str("# Related Tests\n");
                for test_file in test_files {
                    context.push_str(&format!("- {}\n", test_file));
                }
                context.push('\n');
            }
        }
    }

    Ok(context)
}

/// Generate deep context: everything including dependencies and conventions.
fn generate_deep_context(wt: &WorktreePath, task: &Option<String>) -> Result<String, WorktreeError> {
    let mut context = generate_standard_context(wt, task)?;

    // Add project conventions
    if let Ok(conventions) = find_project_conventions(wt) {
        if !conventions.is_empty() {
            context.push_str("# Project Conventions\n");
            context.push_str("Configuration files found:\n");
            for file in conventions {
                context.push_str(&format!("- {}\n", file));
            }
            context.push('\n');
        }
    }

    // Try to get CI status
    if let Ok(ci_status) = get_ci_status(wt) {
        context.push_str(&format!("# CI Status\n{}\n\n", ci_status));
    }

    // Basic dependency info
    context.push_str("# Dependencies\n");
    if wt.as_path().join("package.json").exists() {
        context.push_str("- npm/yarn project detected\n");
    }
    if wt.as_path().join("Cargo.toml").exists() {
        context.push_str("- Rust/Cargo project detected\n");
    }
    if wt.as_path().join("go.mod").exists() {
        context.push_str("- Go project detected\n");
    }
    if wt.as_path().join("pyproject.toml").exists() {
        context.push_str("- Python project detected\n");
    }
    context.push('\n');

    Ok(context)
}

/// Generate appropriate context based on depth setting.
fn generate_context(
    wt: &WorktreePath,
    depth: ContextDepth,
    task: &Option<String>,
) -> Result<String, WorktreeError> {
    match depth {
        ContextDepth::Minimal => generate_minimal_context(wt),
        ContextDepth::Standard => generate_standard_context(wt, task),
        ContextDepth::Deep => generate_deep_context(wt, task),
    }
}

/// Inject context into appropriate files based on target.
#[instrument(skip(wt, config), level = "debug")]
pub fn inject_context_v2(
    wt: &WorktreePath,
    _branch: &str,
    config: &ContextConfig,
) -> Result<GeneratedContext, WorktreeError> {
    let context_content = generate_context(wt, config.depth, &config.task_description)?;

    let mut files_written = Vec::new();
    let mut summary = String::new();

    // Determine which files to write based on target
    let targets = match config.target {
        ContextTarget::Claude => vec!["CLAUDE.md"],
        ContextTarget::Cursor => vec![".cursorrules"],
        ContextTarget::Antigravity => vec![".antigravity/context.json"],
        ContextTarget::All => vec!["CLAUDE.md", ".cursorrules", ".antigravity/context.json"],
    };

    for target in targets {
        let path = wt.as_path().join(target);

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| WorktreeError::Io {
                message: format!("Failed to create directory for context file: {}", e),
            })?;
        }

        // Write context in appropriate format
        let content = if target == ".antigravity/context.json" {
            // JSON format for Antigravity
            let json_obj = serde_json::json!({
                "task": config.task_description,
                "depth": format!("{:?}", config.depth),
                "context": context_content
            });
            serde_json::to_string_pretty(&json_obj).map_err(|e| WorktreeError::Other {
                message: format!("Failed to serialize context JSON: {}", e),
            })?
        } else {
            // Markdown format for Claude and Cursor: prefix with the minimal MCP-first rule.
            format!("{mcp}\n\n{context}", mcp = MCP_FIRST_BLOCK, context = context_content)
        };

        fs::write(&path, &content).map_err(|e| WorktreeError::Io {
            message: format!("Failed to write context file {}: {}", target, e),
        })?;

        files_written.push(target.to_string());
        summary.push_str(&format!(
            "Generated {} with {} depth context\n",
            target,
            match config.depth {
                ContextDepth::Minimal => "minimal",
                ContextDepth::Standard => "standard",
                ContextDepth::Deep => "deep",
            }
        ));
    }

    Ok(GeneratedContext {
        files_written,
        content_summary: summary,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_depth_serialization() {
        let depths = vec![
            ContextDepth::Minimal,
            ContextDepth::Standard,
            ContextDepth::Deep,
        ];

        for depth in depths {
            let json = serde_json::to_string(&depth).unwrap();
            let parsed: ContextDepth = serde_json::from_str(&json).unwrap();
            assert_eq!(depth, parsed);
        }
    }

    #[test]
    fn test_context_target_serialization() {
        let targets = vec![
            ContextTarget::Claude,
            ContextTarget::Cursor,
            ContextTarget::Antigravity,
            ContextTarget::All,
        ];

        for target in targets {
            let json = serde_json::to_string(&target).unwrap();
            let parsed: ContextTarget = serde_json::from_str(&json).unwrap();
            assert_eq!(target, parsed);
        }
    }

    #[test]
    fn test_context_config_serialization() {
        let config = ContextConfig {
            depth: ContextDepth::Deep,
            target: ContextTarget::Claude,
            task_description: Some("Implement user authentication".to_string()),
        };

        let json = serde_json::to_string(&config).unwrap();
        let parsed: ContextConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.depth, ContextDepth::Deep);
        assert_eq!(parsed.target, ContextTarget::Claude);
    }

    #[test]
    fn test_generated_context_serialization() {
        let context = GeneratedContext {
            files_written: vec!["CLAUDE.md".to_string()],
            content_summary: "Generated context successfully".to_string(),
        };

        let json = serde_json::to_string(&context).unwrap();
        let parsed: GeneratedContext = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.files_written.len(), 1);
    }
}
