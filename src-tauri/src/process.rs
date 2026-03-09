use std::process::{Command, Stdio};
use std::collections::HashMap;
use std::sync::{Mutex, LazyLock};

// Store running child processes by worktree path
static RUNNING_PROCESSES: LazyLock<Mutex<HashMap<String, std::process::Child>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn start_process(path: &str, command: &str) -> Result<(), String> {
    let args: Vec<&str> = command.split_whitespace().collect();
    if args.is_empty() {
        return Err("Empty command string".into());
    }

    let mut cmd = Command::new(args[0]);
    if args.len() > 1 {
        cmd.args(&args[1..]);
    }

    let child = cmd
        .current_dir(path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start process: {}", e))?;

    let mut processes = RUNNING_PROCESSES.lock().unwrap();

    // Kill any existing process for this worktree before replacing it
    if let Some(mut old_child) = processes.remove(path) {
        let _ = old_child.kill();
    }

    processes.insert(path.to_string(), child);

    Ok(())
}

pub fn stop_process(path: &str) -> Result<(), String> {
    let mut processes = RUNNING_PROCESSES.lock().unwrap();
    if let Some(mut child) = processes.remove(path) {
         child.kill().map_err(|e| format!("Failed to kill process: {}", e))?;
    }
    Ok(())
}
