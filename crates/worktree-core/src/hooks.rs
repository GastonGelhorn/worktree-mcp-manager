use crate::WorktreeError;
use crate::git::run_external;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;
use tracing::instrument;

/// Type of lifecycle hook.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum HookType {
    /// After a new worktree is created
    PostCreate,
    /// After switching to a different worktree
    PostSwitch,
    /// Before attempting a merge
    PreMerge,
    /// After a successful merge
    PostMerge,
    /// Before removing a worktree
    PreRemove,
    /// After removing a worktree
    PostRemove,
}

impl HookType {
    /// Get the TOML section name for this hook type.
    pub fn section_name(&self) -> &str {
        match self {
            HookType::PostCreate => "post-create",
            HookType::PostSwitch => "post-switch",
            HookType::PreMerge => "pre-merge",
            HookType::PostMerge => "post-merge",
            HookType::PreRemove => "pre-remove",
            HookType::PostRemove => "post-remove",
        }
    }
}

/// Configuration for executing a hook.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookConfig {
    /// Shell commands to execute
    pub commands: Vec<String>,
    /// Whether to run in background (non-blocking)
    pub background: bool,
    /// Timeout in seconds (None = no timeout)
    pub timeout_seconds: Option<u64>,
}

/// Source of a hook definition.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HookSource {
    /// User-defined hook from ~/.worktree/hooks.toml
    User,
    /// Project-defined hook from .worktree/hooks.toml
    Project,
}

/// Complete hook definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookDef {
    /// Type of hook
    pub hook_type: HookType,
    /// Configuration
    pub config: HookConfig,
    /// Where this hook came from
    pub source: HookSource,
}

/// Result of executing a hook.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookExecResult {
    /// Description of what was executed
    pub hook: String,
    /// Whether execution succeeded
    pub success: bool,
    /// Output from the hook
    pub output: String,
    /// Duration in milliseconds
    pub duration_ms: u64,
}

/// Get path to user hooks file.
fn user_hooks_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".worktree/hooks.toml")
}

/// Get path to project hooks file.
fn project_hooks_path(repo_root: &Path) -> PathBuf {
    repo_root.join(".worktree/hooks.toml")
}

/// Simple TOML-like parser for hook definitions.
fn parse_hooks_toml(content: &str, source: HookSource) -> Result<Vec<HookDef>, WorktreeError> {
    let mut hooks = Vec::new();

    // Simple state machine parser
    let mut current_hook_type: Option<HookType> = None;
    let mut current_commands: Vec<String> = Vec::new();
    let mut current_background = false;
    let mut current_timeout: Option<u64> = None;

    for line in content.lines() {
        let line = line.trim();

        // Skip comments and empty lines
        if line.starts_with('#') || line.is_empty() {
            continue;
        }

        // Check for hook section headers
        if line.starts_with("[hooks.") && line.ends_with("]") {
            // Save previous hook if exists
            if let Some(hook_type) = current_hook_type {
                if !current_commands.is_empty() {
                    hooks.push(HookDef {
                        hook_type,
                        config: HookConfig {
                            commands: current_commands.clone(),
                            background: current_background,
                            timeout_seconds: current_timeout,
                        },
                        source,
                    });
                }
            }

            // Parse new hook type
            let section = line.trim_start_matches("[hooks.").trim_end_matches("]");
            current_hook_type = match section {
                "post-create" => Some(HookType::PostCreate),
                "post-switch" => Some(HookType::PostSwitch),
                "pre-merge" => Some(HookType::PreMerge),
                "post-merge" => Some(HookType::PostMerge),
                "pre-remove" => Some(HookType::PreRemove),
                "post-remove" => Some(HookType::PostRemove),
                _ => None,
            };

            current_commands.clear();
            current_background = false;
            current_timeout = None;
        } else if let Some(_) = current_hook_type {
            // Parse properties within current hook section
            if line.starts_with("commands =") {
                let value = line.split('=').nth(1).unwrap_or("").trim();
                // Very basic array parsing
                if value.starts_with('[') && value.ends_with(']') {
                    let inner = value.trim_matches('[').trim_matches(']');
                    for cmd in inner.split(',') {
                        let cmd = cmd.trim().trim_matches('"');
                        if !cmd.is_empty() {
                            current_commands.push(cmd.to_string());
                        }
                    }
                }
            } else if line.starts_with("background =") {
                current_background = line.contains("true");
            } else if line.starts_with("timeout_seconds =") {
                if let Ok(timeout) = line
                    .split('=')
                    .nth(1)
                    .unwrap_or("")
                    .trim()
                    .parse::<u64>()
                {
                    current_timeout = Some(timeout);
                }
            }
        }
    }

    // Save last hook if exists
    if let Some(hook_type) = current_hook_type {
        if !current_commands.is_empty() {
            hooks.push(HookDef {
                hook_type,
                config: HookConfig {
                    commands: current_commands,
                    background: current_background,
                    timeout_seconds: current_timeout,
                },
                source,
            });
        }
    }

    Ok(hooks)
}

/// Discover hooks from both user and project configurations.
#[instrument(level = "debug")]
pub fn discover_hooks(repo: &Path) -> Result<Vec<HookDef>, WorktreeError> {
    let mut all_hooks = Vec::new();

    // Load user hooks
    let user_path = user_hooks_path();
    if user_path.exists() {
        match fs::read_to_string(&user_path) {
            Ok(content) => {
                match parse_hooks_toml(&content, HookSource::User) {
                    Ok(mut hooks) => all_hooks.append(&mut hooks),
                    Err(e) => {
                        tracing::warn!(
                            path = %user_path.display(),
                            error = %e,
                            "Failed to parse user hooks"
                        );
                    }
                }
            }
            Err(e) => {
                tracing::warn!(
                    path = %user_path.display(),
                    error = %e,
                    "Failed to read user hooks file"
                );
            }
        }
    }

    // Load project hooks
    let project_path = project_hooks_path(repo);
    if project_path.exists() {
        match fs::read_to_string(&project_path) {
            Ok(content) => {
                match parse_hooks_toml(&content, HookSource::Project) {
                    Ok(mut hooks) => all_hooks.append(&mut hooks),
                    Err(e) => {
                        tracing::warn!(
                            path = %project_path.display(),
                            error = %e,
                            "Failed to parse project hooks"
                        );
                    }
                }
            }
            Err(e) => {
                tracing::warn!(
                    path = %project_path.display(),
                    error = %e,
                    "Failed to read project hooks file"
                );
            }
        }
    }

    Ok(all_hooks)
}

/// Execute a single hook.
#[instrument(skip(hook), level = "debug")]
pub fn execute_hook(hook: &HookDef, working_dir: &Path) -> Result<HookExecResult, WorktreeError> {
    let start = Instant::now();
    let mut output = String::new();
    let hook_name = format!("{:?}", hook.hook_type);

    if hook.config.background {
        // Background execution: spawn detached process
        for command in &hook.config.commands {
            let log_dir = working_dir.join(".git/wt-logs");
            fs::create_dir_all(&log_dir).ok();

            let _log_file = log_dir.join(format!("{}.log", hook.hook_type.section_name()));

            let _child = Command::new("sh")
                .arg("-c")
                .arg(command)
                .current_dir(working_dir)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();

            output.push_str(&format!("Started: {}\n", command));
        }

        Ok(HookExecResult {
            hook: hook_name,
            success: true,
            output,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    } else {
        // Foreground execution: run synchronously
        let mut success = true;

        for command in &hook.config.commands {
            match run_external("sh", working_dir, &["-c", command]) {
                Ok(cmd_output) => {
                    output.push_str(&cmd_output);
                }
                Err(e) => {
                    success = false;
                    output.push_str(&format!("Error executing '{}': {}\n", command, e));

                    // If hook has a timeout and we've exceeded it, stop trying
                    if let Some(timeout) = hook.config.timeout_seconds {
                        if start.elapsed().as_secs() > timeout {
                            break;
                        }
                    }
                }
            }
        }

        Ok(HookExecResult {
            hook: hook_name,
            success,
            output,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }
}

/// List all discovered hooks.
#[instrument(level = "debug")]
pub fn list_hooks(repo: &Path) -> Result<Vec<HookDef>, WorktreeError> {
    discover_hooks(repo)
}

/// Set or update a hook configuration.
#[instrument(skip(config), level = "debug")]
pub fn set_hook(
    hook_type: &HookType,
    config: &HookConfig,
    source: &HookSource,
    path: &Path,
) -> Result<(), WorktreeError> {
    let hooks_path = match source {
        HookSource::User => user_hooks_path(),
        HookSource::Project => project_hooks_path(path),
    };

    // Ensure parent directory exists
    if let Some(parent) = hooks_path.parent() {
        fs::create_dir_all(parent).map_err(|e| WorktreeError::Io {
            message: format!("Failed to create hooks directory: {}", e),
        })?;
    }

    // Read existing content or start fresh
    let mut content = if hooks_path.exists() {
        fs::read_to_string(&hooks_path).map_err(|e| WorktreeError::Io {
            message: format!("Failed to read hooks file: {}", e),
        })?
    } else {
        String::new()
    };

    // Generate new hook section
    let section_name = hook_type.section_name();
    let commands_str = config
        .commands
        .iter()
        .map(|cmd| format!("\"{}\"", cmd))
        .collect::<Vec<_>>()
        .join(", ");

    let new_hook_section = format!(
        "[hooks.{}]\ncommands = [{}]\nbackground = {}\n",
        section_name, commands_str, config.background
    );

    if let Some(timeout) = config.timeout_seconds {
        content.push_str(&format!("timeout_seconds = {}\n\n", timeout));
    } else {
        content.push_str("\n");
    }

    // Append new section
    content.push_str(&new_hook_section);

    fs::write(&hooks_path, content).map_err(|e| WorktreeError::Io {
        message: format!("Failed to write hooks file: {}", e),
    })?;

    tracing::info!(
        hook_type = %format!("{:?}", hook_type),
        path = %hooks_path.display(),
        "Hook configured"
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hook_type_section_name() {
        assert_eq!(HookType::PostCreate.section_name(), "post-create");
        assert_eq!(HookType::PreMerge.section_name(), "pre-merge");
        assert_eq!(HookType::PostRemove.section_name(), "post-remove");
    }

    #[test]
    fn test_hook_config_serialization() {
        let config = HookConfig {
            commands: vec!["npm test".to_string(), "npm lint".to_string()],
            background: false,
            timeout_seconds: Some(300),
        };

        let json = serde_json::to_string(&config).unwrap();
        let parsed: HookConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.commands.len(), 2);
        assert_eq!(parsed.timeout_seconds, Some(300));
    }

    #[test]
    fn test_hook_def_serialization() {
        let hook = HookDef {
            hook_type: HookType::PostCreate,
            config: HookConfig {
                commands: vec!["npm install".to_string()],
                background: false,
                timeout_seconds: None,
            },
            source: HookSource::Project,
        };

        let json = serde_json::to_string(&hook).unwrap();
        let parsed: HookDef = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.hook_type, HookType::PostCreate);
        assert_eq!(parsed.source, HookSource::Project);
    }

    #[test]
    fn test_parse_hooks_toml() {
        let content = r#"
[hooks.post-create]
commands = ["npm install", "npm run build"]
background = false
timeout_seconds = 600

[hooks.pre-merge]
commands = ["npm test"]
background = false
"#;

        let hooks = parse_hooks_toml(content, HookSource::User).unwrap();
        assert_eq!(hooks.len(), 2);

        let post_create = &hooks[0];
        assert_eq!(post_create.hook_type, HookType::PostCreate);
        assert_eq!(post_create.config.commands.len(), 2);
        assert_eq!(post_create.config.timeout_seconds, Some(600));
    }

    #[test]
    fn test_hook_exec_result_serialization() {
        let result = HookExecResult {
            hook: "PostCreate".to_string(),
            success: true,
            output: "Installation complete".to_string(),
            duration_ms: 1500,
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: HookExecResult = serde_json::from_str(&json).unwrap();

        assert!(parsed.success);
        assert_eq!(parsed.duration_ms, 1500);
    }

    #[test]
    fn test_hook_source_serialization() {
        let sources = vec![HookSource::User, HookSource::Project];

        for source in sources {
            let json = serde_json::to_string(&source).unwrap();
            let parsed: HookSource = serde_json::from_str(&json).unwrap();
            assert_eq!(source, parsed);
        }
    }

    #[test]
    fn test_hook_type_serialization() {
        let types = vec![
            HookType::PostCreate,
            HookType::PostSwitch,
            HookType::PreMerge,
            HookType::PostMerge,
            HookType::PreRemove,
            HookType::PostRemove,
        ];

        for hook_type in types {
            let json = serde_json::to_string(&hook_type).unwrap();
            let parsed: HookType = serde_json::from_str(&json).unwrap();
            assert_eq!(hook_type, parsed);
        }
    }
}
