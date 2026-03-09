use crate::WorktreeError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
pub struct IdeSetupResult {
    pub ide: String,
    pub path: String,
    pub success: bool,
    pub message: String,
}

/// Detect available IDE config paths relative to a repo and globally.
pub fn detect_ide_configs(repo_path: &str) -> Vec<(String, PathBuf)> {
    let repo = Path::new(repo_path);
    let home = dirs_path();
    let mut found = Vec::new();

    // Cursor: .cursor/mcp.json in repo — detect if Cursor app is installed
    let cursor_app_exists = Path::new("/Applications/Cursor.app").exists();
    if cursor_app_exists {
        let cursor_repo = repo.join(".cursor").join("mcp.json");
        found.push(("Cursor (project)".to_string(), cursor_repo));
    }

    // VS Code: only if `code` command is available in PATH
    let vscode_installed = std::process::Command::new("which")
        .arg("code")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if vscode_installed {
        let vscode_repo = repo.join(".vscode").join("settings.json");
        found.push(("VS Code (project)".to_string(), vscode_repo));
    }

    // Claude CLI: only if `claude` command is available
    let claude_installed = find_claude_binary().is_some();
    if claude_installed {
        let claude_global = home.as_ref()
            .map(|h| h.join(".claude.json"))
            .unwrap_or_else(|| PathBuf::from("~/.claude.json"));
        found.push(("Claude CLI (global)".to_string(), claude_global));
    }

    found
}

/// Find the claude binary - it may not be in PATH when running from Tauri
fn find_claude_binary() -> Option<PathBuf> {
    // Common macOS locations for claude
    let candidates = [
        "/usr/local/bin/claude",
        "/opt/homebrew/bin/claude",
    ];
    for candidate in &candidates {
        let p = Path::new(candidate);
        if p.exists() {
            return Some(p.to_path_buf());
        }
    }
    // Also check via which (for custom installs)
    if let Ok(output) = std::process::Command::new("which").arg("claude").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(PathBuf::from(path));
            }
        }
    }
    None
}

/// Setup MCP server configuration for all detected IDEs.
pub fn setup_all_ides(repo_path: &str, server_path: &str, cli_path: Option<&str>) -> Result<Vec<IdeSetupResult>, WorktreeError> {
    let configs = detect_ide_configs(repo_path);
    let mut results = Vec::new();

    for (ide_name, config_path) in configs {
        let result = if ide_name.starts_with("Cursor") {
            setup_cursor_mcp(&config_path, server_path, cli_path)
        } else if ide_name.starts_with("VS Code") {
            setup_vscode_mcp(&config_path, server_path, cli_path)
        } else if ide_name.starts_with("Claude CLI") {
            setup_claude_cli_mcp(server_path, cli_path)
        } else {
            continue;
        };

        match result {
            Ok(msg) => results.push(IdeSetupResult {
                ide: ide_name,
                path: config_path.to_string_lossy().to_string(),
                success: true,
                message: msg,
            }),
            Err(e) => results.push(IdeSetupResult {
                ide: ide_name,
                path: config_path.to_string_lossy().to_string(),
                success: false,
                message: e.to_string(),
            }),
        }
    }

    Ok(results)
}

fn setup_cursor_mcp(config_path: &Path, server_path: &str, cli_path: Option<&str>) -> Result<String, WorktreeError> {
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| WorktreeError::Io {
            message: format!("Failed to create .cursor dir: {}", e),
        })?;
    }

    let mut config: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(config_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let mut env = serde_json::Map::new();
    if let Some(cli) = cli_path {
        env.insert("WORKTREE_CLI_PATH".to_string(), serde_json::json!(cli));
    }

    let config_obj = config.as_object_mut().ok_or_else(|| WorktreeError::Io {
        message: "Cursor config is not a valid JSON object".to_string(),
    })?;

    let mcp_servers = config_obj
        .entry("mcpServers".to_string())
        .or_insert(serde_json::json!({}));

    let mcp_obj = mcp_servers.as_object_mut().ok_or_else(|| WorktreeError::Io {
        message: "mcpServers is not a valid JSON object in Cursor config".to_string(),
    })?;

    mcp_obj.insert("worktree-mcp".to_string(), serde_json::json!({
        "command": "node",
        "args": [server_path],
        "env": env,
    }));

    let serialized = serde_json::to_string_pretty(&config).map_err(|e| WorktreeError::Io {
        message: format!("Failed to serialize Cursor config: {}", e),
    })?;

    fs::write(config_path, serialized)
        .map_err(|e| WorktreeError::Io { message: format!("Failed to write Cursor config: {}", e) })?;

    Ok("Cursor MCP config written".to_string())
}

fn setup_vscode_mcp(config_path: &Path, server_path: &str, cli_path: Option<&str>) -> Result<String, WorktreeError> {
    let mut config: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(config_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let mut env = serde_json::Map::new();
    if let Some(cli) = cli_path {
        env.insert("WORKTREE_CLI_PATH".to_string(), serde_json::json!(cli));
    }

    let config_obj = config.as_object_mut().ok_or_else(|| WorktreeError::Io {
        message: "VS Code config is not a valid JSON object".to_string(),
    })?;

    let mcp_servers = config_obj
        .entry("mcp.servers".to_string())
        .or_insert(serde_json::json!({}));

    let mcp_obj = mcp_servers.as_object_mut().ok_or_else(|| WorktreeError::Io {
        message: "mcp.servers is not a valid JSON object in VS Code config".to_string(),
    })?;

    mcp_obj.insert("worktree-mcp".to_string(), serde_json::json!({
        "command": "node",
        "args": [server_path],
        "env": env,
    }));

    let serialized = serde_json::to_string_pretty(&config).map_err(|e| WorktreeError::Io {
        message: format!("Failed to serialize VS Code config: {}", e),
    })?;

    fs::write(config_path, serialized)
        .map_err(|e| WorktreeError::Io { message: format!("Failed to write VS Code config: {}", e) })?;

    Ok("VS Code MCP config written".to_string())
}

fn setup_claude_cli_mcp(server_path: &str, cli_path: Option<&str>) -> Result<String, WorktreeError> {
    use std::process::Command;

    let claude_bin = find_claude_binary()
        .ok_or_else(|| WorktreeError::Io { message: "Claude CLI not found in PATH or common locations".to_string() })?;

    let mut args = vec![
        "mcp".to_string(),
        "add".to_string(),
        "--scope".to_string(),
        "user".to_string(),
    ];

    if let Some(cli) = cli_path {
        args.push("-e".to_string());
        args.push(format!("WORKTREE_CLI_PATH={}", cli));
    }

    args.extend(["worktree-mcp".to_string(), "--".to_string(), "node".to_string(), server_path.to_string()]);

    let output = Command::new(&claude_bin)
        .args(&args)
        .output()
        .map_err(|e| WorktreeError::Io { message: format!("Failed to execute {}: {}", claude_bin.display(), e) })?;

    if output.status.success() {
        Ok("Claude CLI MCP registered".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("already exists") {
            Ok("Claude CLI MCP already configured".to_string())
        } else {
            Err(WorktreeError::Io { message: format!("claude mcp add failed: {}", stderr.trim()) })
        }
    }
}

fn dirs_path() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}
