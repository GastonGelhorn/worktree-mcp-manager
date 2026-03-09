use crate::WorktreeError;
use std::process::Command;

/// Run a hook command synchronously and return its output.
/// This is stateless — it spawns, waits, and returns.
pub fn run_hook(path: &str, command: &str) -> Result<String, WorktreeError> {
    let args: Vec<&str> = command.split_whitespace().collect();
    if args.is_empty() {
        return Ok(String::new());
    }

    let mut cmd = Command::new(args[0]);
    if args.len() > 1 {
        cmd.args(&args[1..]);
    }

    let output = cmd
        .current_dir(path)
        .output()
        .map_err(|e| WorktreeError::Process {
            message: format!("Failed to execute hook: {}", e),
        })?;

    if !output.status.success() {
        return Err(WorktreeError::Process {
            message: String::from_utf8_lossy(&output.stderr).to_string(),
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
