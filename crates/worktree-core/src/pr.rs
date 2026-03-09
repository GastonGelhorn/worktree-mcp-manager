use crate::WorktreeError;
use std::process::Command;

pub fn generate_pr_url(repo_path: &str, branch: &str) -> Result<String, WorktreeError> {
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(["config", "--get", "remote.origin.url"])
        .output()
        .map_err(|e| WorktreeError::Git {
            message: format!("Failed to read git config: {}", e),
        })?;

    if !output.status.success() {
        return Err(WorktreeError::Git {
            message: "No remote origin found for this repository.".into(),
        });
    }

    let raw_url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if raw_url.is_empty() {
        return Err(WorktreeError::Git {
            message: "Remote origin is empty.".into(),
        });
    }

    let mut base_url = raw_url.clone();

    if base_url.starts_with("git@") {
        base_url = base_url.replace("git@", "https://");
        base_url = base_url.replacen(":", "/", 1);
    }

    if base_url.ends_with(".git") {
        base_url = base_url.trim_end_matches(".git").to_string();
    }

    let url = if base_url.contains("gitlab.com") {
        format!(
            "{}/-/merge_requests/new?merge_request[source_branch]={}",
            base_url, branch
        )
    } else {
        format!("{}/compare/{}?expand=1", base_url, branch)
    };

    Ok(url)
}
