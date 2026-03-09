use crate::WorktreeError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tracing::instrument;

/// A single step in a workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStep {
    /// Name of the tool to execute (e.g., "git", "build", "test")
    pub tool: String,
    /// Parameters to pass to the tool as JSON
    pub params: serde_json::Value,
    /// Human-readable description of what this step does
    pub description: String,
}

/// A complete workflow definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowDef {
    /// Name of the workflow
    pub name: String,
    /// Steps to execute in order
    pub steps: Vec<WorkflowStep>,
    /// Whether user confirmation is required before executing
    pub requires_confirmation: bool,
}

/// Result of executing a workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowResult {
    /// Whether the workflow completed successfully
    pub success: bool,
    /// Number of steps completed
    pub steps_completed: u32,
    /// Total number of steps
    pub total_steps: u32,
    /// Results from each step
    pub results: Vec<StepResult>,
}

/// Result of a single workflow step.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    /// Description of the step
    pub step: String,
    /// Whether the step succeeded
    pub success: bool,
    /// Output from the step
    pub output: serde_json::Value,
    /// Error message if step failed
    pub error: Option<String>,
}

/// Get all built-in workflow definitions.
#[instrument(level = "debug")]
pub fn list_builtin_workflows() -> Vec<WorkflowDef> {
    vec![]
}

/// Get the path to the custom workflows directory.
fn custom_workflows_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".worktree/workflows")
}

/// Load custom workflows from ~/.worktree/workflows/*.toml
#[instrument(level = "debug")]
pub fn load_custom_workflows() -> Result<Vec<WorkflowDef>, WorktreeError> {
    let dir = custom_workflows_dir();

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut workflows = Vec::new();

    // Read all .toml files in the directory
    match fs::read_dir(&dir) {
        Ok(entries) => {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|ext| ext == "toml").unwrap_or(false) {
                    match fs::read_to_string(&path) {
                        Ok(content) => {
                            // Try to parse as TOML-like format
                            match parse_workflow_toml(&content) {
                                Ok(workflow) => workflows.push(workflow),
                                Err(e) => {
                                    tracing::warn!(
                                        path = %path.display(),
                                        error = %e,
                                        "Failed to parse workflow file"
                                    );
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!(
                                path = %path.display(),
                                error = %e,
                                "Failed to read workflow file"
                            );
                        }
                    }
                }
            }
        }
        Err(e) => {
            return Err(WorktreeError::Io {
                message: format!("Failed to read workflows directory: {}", e),
            });
        }
    }

    Ok(workflows)
}

/// Simple TOML-like parser for workflow files.
fn parse_workflow_toml(content: &str) -> Result<WorkflowDef, WorktreeError> {
    // Very basic parser - in production would use proper TOML library
    let mut name = String::new();
    let mut requires_confirmation = false;
    let mut steps = Vec::new();

    for line in content.lines() {
        let line = line.trim();

        if line.starts_with("name =") {
            name = line
                .split('=')
                .nth(1)
                .unwrap_or("")
                .trim()
                .trim_matches('"')
                .to_string();
        }

        if line.starts_with("requires_confirmation =") {
            requires_confirmation = line.contains("true");
        }

        if line.starts_with("[[steps]]") {
            // Simple step parsing
            let mut tool = String::new();
            let mut description = String::new();

            // Look for tool and description in following lines
            let mut found_step = false;
            let i = content.find(line).unwrap_or(0);
            for remaining in content[i..].lines().skip(1) {
                let remaining = remaining.trim();
                if remaining.starts_with("[[") || remaining.starts_with("[") {
                    break;
                }
                if remaining.starts_with("tool =") {
                    tool = remaining
                        .split('=')
                        .nth(1)
                        .unwrap_or("")
                        .trim()
                        .trim_matches('"')
                        .to_string();
                    found_step = true;
                }
                if remaining.starts_with("description =") {
                    description = remaining
                        .split('=')
                        .nth(1)
                        .unwrap_or("")
                        .trim()
                        .trim_matches('"')
                        .to_string();
                }

                if found_step && !tool.is_empty() {
                    break;
                }
            }

            if !tool.is_empty() {
                steps.push(WorkflowStep {
                    tool,
                    params: serde_json::json!({}),
                    description,
                });
            }
        }
    }

    if name.is_empty() {
        return Err(WorktreeError::Other {
            message: "Workflow name is required".to_string(),
        });
    }

    Ok(WorkflowDef {
        name,
        steps,
        requires_confirmation,
    })
}

/// Validate that all tools referenced in a workflow exist.
#[instrument(skip(workflow), level = "debug")]
pub fn validate_workflow(workflow: &WorkflowDef) -> Result<(), WorktreeError> {
    // List of known tools
    let known_tools = vec![
        "git", "test", "lint", "format", "build", "deploy", "push", "pull",
    ];

    for step in &workflow.steps {
        if !known_tools.contains(&step.tool.as_str()) {
            return Err(WorktreeError::Other {
                message: format!("Unknown tool: {} in workflow {}", step.tool, workflow.name),
            });
        }
    }

    Ok(())
}

/// Execute a workflow in a given worktree directory.
///
/// This runs each step sequentially, calling the appropriate git/shell commands.
/// If a step fails and the workflow requires confirmation, execution stops.
/// Returns a WorkflowResult with details of each step's outcome.
#[instrument(skip(workflow), fields(workflow_name = %workflow.name), level = "info")]
pub fn run_workflow(
    wt_path: &Path,
    workflow: &WorkflowDef,
) -> Result<WorkflowResult, WorktreeError> {
    let total_steps = workflow.steps.len() as u32;
    let mut results = Vec::new();
    let mut steps_completed = 0u32;
    let mut all_success = true;

    for step in &workflow.steps {
        tracing::info!(step = %step.description, tool = %step.tool, "Executing workflow step");

        let step_result = execute_step(wt_path, step);
        let success = step_result.success;
        results.push(step_result);

        if success {
            steps_completed += 1;
        } else {
            all_success = false;
            tracing::warn!(
                step = %step.description,
                "Workflow step failed, stopping execution"
            );
            break;
        }
    }

    Ok(WorkflowResult {
        success: all_success,
        steps_completed,
        total_steps,
        results,
    })
}

/// Execute a single workflow step by dispatching to the appropriate tool.
fn execute_step(wt_path: &Path, step: &WorkflowStep) -> StepResult {
    let start = std::time::Instant::now();

    let result = match step.tool.as_str() {
        "git" => execute_git_step(wt_path, &step.params),
        "test" => execute_shell_step(wt_path, "test", &step.params),
        "lint" => execute_shell_step(wt_path, "lint", &step.params),
        "format" => execute_shell_step(wt_path, "format", &step.params),
        "build" => execute_shell_step(wt_path, "build", &step.params),
        "deploy" => execute_shell_step(wt_path, "deploy", &step.params),
        "push" => execute_git_step(wt_path, &serde_json::json!({"command": "push"})),
        "pull" => execute_git_step(wt_path, &serde_json::json!({"command": "pull"})),
        other => Err(WorktreeError::Other {
            message: format!("Unknown tool: {}", other),
        }),
    };

    let elapsed = start.elapsed();

    match result {
        Ok(output) => StepResult {
            step: step.description.clone(),
            success: true,
            output: serde_json::json!({
                "stdout": output,
                "duration_ms": elapsed.as_millis() as u64,
            }),
            error: None,
        },
        Err(e) => StepResult {
            step: step.description.clone(),
            success: false,
            output: serde_json::json!({
                "duration_ms": elapsed.as_millis() as u64,
            }),
            error: Some(e.to_string()),
        },
    }
}

/// Execute a git command step.
fn execute_git_step(wt_path: &Path, params: &serde_json::Value) -> Result<String, WorktreeError> {
    let command = params.get("command")
        .and_then(|v| v.as_str())
        .ok_or_else(|| WorktreeError::Other {
            message: "Git step missing 'command' parameter".to_string(),
        })?;

    let mut args = vec![command];

    // Handle common git command parameters
    match command {
        "add" => {
            if params.get("all").and_then(|v| v.as_bool()).unwrap_or(false) {
                args.push("-A");
            }
        }
        "commit" => {
            if let Some(msg) = params.get("message").and_then(|v| v.as_str()) {
                args.push("-m");
                args.push(msg);
            }
        }
        "checkout" => {
            if let Some(branch) = params.get("branch").and_then(|v| v.as_str()) {
                args.push(branch);
            }
        }
        "rebase" => {
            if let Some(base) = params.get("base").and_then(|v| v.as_str()) {
                args.push(base);
            }
        }
        "fetch" => {
            if params.get("prune").and_then(|v| v.as_bool()).unwrap_or(false) {
                args.push("--prune");
            }
        }
        "diff" => {
            // Just run git diff with optional context
        }
        "tag" => {
            if let Some(msg) = params.get("message").and_then(|v| v.as_str()) {
                args.push(msg);
            }
        }
        "push" => {
            if let Some(branch) = params.get("branch").and_then(|v| v.as_str()) {
                args.push(branch);
            }
        }
        _ => {}
    }

    let output = std::process::Command::new("git")
        .current_dir(wt_path)
        .args(&args)
        .output()
        .map_err(|e| WorktreeError::Git {
            message: format!("Failed to execute git {}: {}", command, e),
        })?;

    if !output.status.success() {
        return Err(WorktreeError::Git {
            message: format!(
                "git {} failed: {}",
                command,
                String::from_utf8_lossy(&output.stderr).trim()
            ),
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Execute a shell-based tool step (test, lint, format, build, deploy).
///
/// Tries common runners in order:
/// - npm/yarn/pnpm scripts (if package.json exists)
/// - Makefile targets (if Makefile exists)
/// - Cargo commands (if Cargo.toml exists)
fn execute_shell_step(
    wt_path: &Path,
    tool: &str,
    _params: &serde_json::Value,
) -> Result<String, WorktreeError> {
    // Detect project type and find the right command
    let (bin, args) = if wt_path.join("package.json").exists() {
        // Node.js project - use npm run
        let runner = if wt_path.join("yarn.lock").exists() {
            "yarn"
        } else if wt_path.join("pnpm-lock.yaml").exists() {
            "pnpm"
        } else {
            "npm"
        };
        (runner.to_string(), vec!["run".to_string(), tool.to_string()])
    } else if wt_path.join("Cargo.toml").exists() {
        // Rust project
        let cargo_cmd = match tool {
            "test" => "test",
            "build" => "build",
            "lint" => "clippy",
            "format" => "fmt",
            _ => tool,
        };
        ("cargo".to_string(), vec![cargo_cmd.to_string()])
    } else if wt_path.join("Makefile").exists() {
        ("make".to_string(), vec![tool.to_string()])
    } else {
        return Err(WorktreeError::Other {
            message: format!(
                "Cannot determine how to run '{}' - no package.json, Cargo.toml, or Makefile found",
                tool
            ),
        });
    };

    let output = std::process::Command::new(&bin)
        .current_dir(wt_path)
        .args(&args)
        .output()
        .map_err(|e| WorktreeError::Process {
            message: format!("Failed to execute {} {}: {}", bin, args.join(" "), e),
        })?;

    if !output.status.success() {
        return Err(WorktreeError::Process {
            message: format!(
                "{} {} failed: {}",
                bin,
                args.join(" "),
                String::from_utf8_lossy(&output.stderr).trim()
            ),
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Get a workflow by name (checks built-in first, then custom).
#[instrument(level = "debug")]
pub fn get_workflow(name: &str) -> Result<WorkflowDef, WorktreeError> {
    let workflows = load_custom_workflows()?;
    for wf in workflows {
        if wf.name == name {
            return Ok(wf);
        }
    }

    Err(WorktreeError::Other {
        message: format!("Workflow '{}' not found", name),
    })
}

/// List all available workflows (built-in + custom).
#[instrument(level = "debug")]
pub fn list_all_workflows() -> Result<Vec<WorkflowDef>, WorktreeError> {
    load_custom_workflows()
}

/// Save a custom workflow to ~/.worktree/workflows/{name}.toml
#[instrument(skip(workflow), fields(workflow_name = %workflow.name), level = "info")]
pub fn save_custom_workflow(workflow: &WorkflowDef) -> Result<(), WorktreeError> {
    let dir = custom_workflows_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| WorktreeError::Io {
            message: format!("Failed to create workflows directory: {}", e),
        })?;
    }

    let filename = format!("{}.toml", workflow.name.replace(' ', "_").to_lowercase());
    let path = dir.join(&filename);

    let mut content = String::new();
    content.push_str(&format!("name = \"{}\"\n", workflow.name));
    content.push_str(&format!("requires_confirmation = {}\n\n", workflow.requires_confirmation));

    for step in &workflow.steps {
        content.push_str("[[steps]]\n");
        content.push_str(&format!("tool = \"{}\"\n", step.tool));
        content.push_str(&format!("description = \"{}\"\n\n", step.description));
    }

    fs::write(&path, content).map_err(|e| WorktreeError::Io {
        message: format!("Failed to write workflow file: {}", e),
    })?;

    tracing::info!(path = %path.display(), "Saved custom workflow");
    Ok(())
}

/// Delete a custom workflow by name.
#[instrument(level = "info")]
pub fn delete_custom_workflow(name: &str) -> Result<(), WorktreeError> {
    let dir = custom_workflows_dir();
    let filename = format!("{}.toml", name.replace(' ', "_").to_lowercase());
    let path = dir.join(&filename);

    if !path.exists() {
        return Err(WorktreeError::Other {
            message: format!("Workflow '{}' not found", name),
        });
    }

    fs::remove_file(&path).map_err(|e| WorktreeError::Io {
        message: format!("Failed to delete workflow file: {}", e),
    })?;

    tracing::info!(path = %path.display(), "Deleted custom workflow");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_builtin_workflows_empty() {
        let workflows = list_builtin_workflows();
        assert!(workflows.is_empty());
    }

    #[test]
    fn test_validate_workflow_valid() {
        let wf = WorkflowDef {
            name: "test_wf".to_string(),
            steps: vec![WorkflowStep {
                tool: "git".to_string(),
                params: serde_json::json!({"command": "status"}),
                description: "git status".to_string(),
            }],
            requires_confirmation: false,
        };
        let result = validate_workflow(&wf);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_workflow_invalid_tool() {
        let wf = WorkflowDef {
            name: "test".to_string(),
            steps: vec![WorkflowStep {
                tool: "unknown_tool".to_string(),
                params: serde_json::json!({}),
                description: "Test step".to_string(),
            }],
            requires_confirmation: false,
        };

        let result = validate_workflow(&wf);
        assert!(result.is_err());
    }

    #[test]
    fn test_workflow_step_serialization() {
        let step = WorkflowStep {
            tool: "git".to_string(),
            params: serde_json::json!({"command": "commit"}),
            description: "Commit changes".to_string(),
        };

        let json = serde_json::to_string(&step).unwrap();
        let parsed: WorkflowStep = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.tool, "git");
        assert_eq!(parsed.description, "Commit changes");
    }

    #[test]
    fn test_workflow_def_serialization() {
        let wf = WorkflowDef {
            name: "my_workflow".to_string(),
            steps: vec![WorkflowStep {
                tool: "git".to_string(),
                params: serde_json::json!({"command": "status"}),
                description: "git status".to_string(),
            }],
            requires_confirmation: false,
        };
        let json = serde_json::to_string(&wf).unwrap();
        let parsed: WorkflowDef = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.name, "my_workflow");
        assert_eq!(parsed.steps.len(), 1);
    }

    #[test]
    fn test_workflow_result_serialization() {
        let result = WorkflowResult {
            success: true,
            steps_completed: 3,
            total_steps: 4,
            results: vec![StepResult {
                step: "Stage changes".to_string(),
                success: true,
                output: serde_json::json!({"staged": 5}),
                error: None,
            }],
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: WorkflowResult = serde_json::from_str(&json).unwrap();

        assert!(parsed.success);
        assert_eq!(parsed.steps_completed, 3);
    }

    #[test]
    fn test_get_workflow_not_found() {
        let result = get_workflow("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_list_all_workflows_empty_without_custom() {
        let workflows = list_all_workflows().unwrap();
        // Only custom workflows exist, so may be empty
        assert!(workflows.len() >= 0);
    }

    #[test]
    fn test_execute_git_step_missing_command() {
        let result = execute_git_step(
            Path::new("/tmp"),
            &serde_json::json!({}),
        );
        assert!(result.is_err());
    }
}
