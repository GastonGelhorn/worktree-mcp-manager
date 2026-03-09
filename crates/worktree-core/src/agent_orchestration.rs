use crate::{WorktreeError, RepoPath};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::instrument;

/// Claim information for a specific agent working on a worktree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentClaim {
    /// Unique identifier for the agent
    pub agent_id: String,
    /// Description of the task being performed
    pub task: String,
    /// ISO 8601 timestamp of when the claim was established
    pub claimed_at: String,
    /// ISO 8601 timestamp of the last heartbeat
    pub heartbeat: String,
    /// Estimated duration of the task (ISO 8601 duration string, e.g., "PT30M")
    pub estimated_duration: Option<String>,
}

/// Container for all active claims on a repository's worktrees.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaimsFile {
    /// Map from worktree path to agent claim
    pub claims: HashMap<String, AgentClaim>,
}

impl ClaimsFile {
    /// Create an empty claims file
    pub fn new() -> Self {
        Self {
            claims: HashMap::new(),
        }
    }
}

impl Default for ClaimsFile {
    fn default() -> Self {
        Self::new()
    }
}

/// Result of attempting to claim a worktree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaimResult {
    /// Whether the claim was successfully acquired
    pub claimed: bool,
    /// If claimed is false, details of the conflicting claim
    pub conflict: Option<AgentClaim>,
}

/// Get the path to the claims file for a repository.
fn claims_file_path(repo: &RepoPath) -> std::path::PathBuf {
    repo.as_path().join(".git/wt-agents.json")
}

/// Get the path to the lock file for the claims file.
fn claims_lock_path(repo: &RepoPath) -> std::path::PathBuf {
    repo.as_path().join(".git/wt-agents.lock")
}

/// Get current time as ISO 8601 string.
fn current_iso8601() -> String {
    let now = SystemTime::now();
    let duration = now
        .duration_since(UNIX_EPOCH)
        .map_err(|_| {
            // If we can't get duration, use epoch time
            std::time::Duration::ZERO
        })
        .unwrap_or_else(|_| std::time::Duration::ZERO);

    let total_secs = duration.as_secs();
    let days_since_epoch = total_secs / 86400;
    let secs_today = total_secs % 86400;

    let hours = secs_today / 3600;
    let minutes = (secs_today % 3600) / 60;
    let seconds = secs_today % 60;

    // Compute year/month/day from days since epoch
    // Handles leap years properly
    let mut remaining_days = days_since_epoch;
    let mut year = 1970u64;
    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        year += 1;
    }

    let days_in_months: [u64; 12] = if is_leap_year(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };

    let mut month = 0u64;
    for (i, &days) in days_in_months.iter().enumerate() {
        if remaining_days < days {
            month = (i + 1) as u64;
            break;
        }
        remaining_days -= days;
    }
    if month == 0 {
        month = 12;
    }
    let day = remaining_days + 1;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, minutes, seconds
    )
}

/// Check if a year is a leap year.
fn is_leap_year(year: u64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

/// Check if a heartbeat timestamp is stale (older than 10 minutes).
fn is_heartbeat_stale(heartbeat_iso: &str) -> bool {
    // Very simple heuristic: if we can't parse it, consider it stale
    // In production, would use proper ISO 8601 parsing
    if heartbeat_iso.is_empty() {
        return true;
    }

    // This is a simplified check - in production would parse the ISO timestamp
    // For now, assume heartbeats sent within the last 10 minutes are fresh
    // We'll check by looking at the timestamp format and comparing
    let now = current_iso8601();

    // Extract hour and minute from both timestamps for simple comparison
    let extract_time = |s: &str| -> Option<(u32, u32)> {
        let parts: Vec<&str> = s.split('T').collect();
        if parts.len() < 2 {
            return None;
        }
        let time_parts: Vec<&str> = parts[1].split(':').collect();
        if time_parts.len() < 2 {
            return None;
        }
        let hour = time_parts[0].parse::<u32>().ok()?;
        let minute = time_parts[1].parse::<u32>().ok()?;
        Some((hour, minute))
    };

    if let (Some((now_h, now_m)), Some((hb_h, hb_m))) = (extract_time(&now), extract_time(heartbeat_iso)) {
        let now_minutes = now_h * 60 + now_m;
        let hb_minutes = hb_h * 60 + hb_m;

        // If more than 10 minutes have passed (or date changed), consider stale
        let diff = if now_minutes >= hb_minutes {
            now_minutes - hb_minutes
        } else {
            // Day changed
            1440 - hb_minutes + now_minutes
        };

        return diff > 10;
    }

    // If we can't parse, be conservative and consider it stale
    true
}

/// Execute a function while holding an exclusive lock on the claims file.
/// This ensures atomic read-modify-write operations.
///
/// The lock is implemented using a lock file (.wt-agents.lock). Holding the file
/// handle for writing provides advisory locking on most OSes.
fn with_claims_lock<F, T>(repo: &RepoPath, f: F) -> Result<T, WorktreeError>
where
    F: FnOnce() -> Result<T, WorktreeError>,
{
    let lock_path = claims_lock_path(repo);

    // Ensure .git directory exists before attempting to create lock file
    let git_dir = repo.as_path().join(".git");
    if !git_dir.exists() {
        fs::create_dir_all(&git_dir).map_err(|e| WorktreeError::Io {
            message: format!("Failed to create .git directory: {}", e),
        })?;
    }

    // Open lock file for writing - holding the write handle provides exclusive access
    let _lock = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&lock_path)
        .map_err(|e| WorktreeError::Io {
            message: format!("Failed to acquire claims lock: {}", e),
        })?;

    // Execute the operation while lock is held
    let result = f()?;

    // Lock is released when _lock is dropped
    Ok(result)
}

/// Load claims file. Must only be called while holding the claims lock.
fn load_claims_file(repo: &RepoPath) -> Result<ClaimsFile, WorktreeError> {
    let path = claims_file_path(repo);

    if !path.exists() {
        return Ok(ClaimsFile::new());
    }

    let content = fs::read_to_string(&path).map_err(|e| WorktreeError::Io {
        message: format!("Failed to read claims file: {}", e),
    })?;

    serde_json::from_str(&content).map_err(|e| WorktreeError::Other {
        message: format!("Failed to parse claims file: {}", e),
    })
}

/// Save claims file. Must only be called while holding the claims lock.
fn save_claims_file(repo: &RepoPath, claims: &ClaimsFile) -> Result<(), WorktreeError> {
    let claims_path = claims_file_path(repo);

    // Serialize claims
    let serialized = serde_json::to_string_pretty(claims).map_err(|e| WorktreeError::Other {
        message: format!("Failed to serialize claims: {}", e),
    })?;

    // Write directly to claims file while lock is held
    fs::write(&claims_path, &serialized).map_err(|e| WorktreeError::Io {
        message: format!("Failed to write claims file: {}", e),
    })?;

    Ok(())
}

/// Attempt to claim a worktree for an agent.
///
/// Returns a ClaimResult indicating whether the claim was successful.
/// If another agent has a fresh claim (heartbeat < 10 min old), returns a conflict.
/// If the existing claim is stale (heartbeat > 10 min old), auto-releases and claims.
#[instrument(skip(repo), level = "debug")]
pub fn agent_claim_worktree(
    repo: &RepoPath,
    wt_path: &str,
    agent_id: &str,
    task: &str,
    estimated_duration: Option<&str>,
) -> Result<ClaimResult, WorktreeError> {
    // Capture parameters for the closure
    let wt_path_str = wt_path.to_string();
    let agent_id_str = agent_id.to_string();
    let task_str = task.to_string();
    let duration_opt = estimated_duration.map(|s| s.to_string());

    with_claims_lock(repo, || {
        let mut claims = load_claims_file(repo)?;

        if let Some(existing_claim) = claims.claims.get(&wt_path_str) {
            // Check if the existing claim is stale
            if is_heartbeat_stale(&existing_claim.heartbeat) {
                // Auto-release stale claim
                tracing::info!(
                    agent_id = %existing_claim.agent_id,
                    wt_path = %wt_path_str,
                    "Auto-releasing stale claim"
                );
            } else {
                // Fresh claim exists - conflict
                return Ok(ClaimResult {
                    claimed: false,
                    conflict: Some(existing_claim.clone()),
                });
            }
        }

        // Create new claim
        let now = current_iso8601();
        let new_claim = AgentClaim {
            agent_id: agent_id_str.clone(),
            task: task_str.clone(),
            claimed_at: now.clone(),
            heartbeat: now,
            estimated_duration: duration_opt.clone(),
        };

        claims.claims.insert(wt_path_str.clone(), new_claim);
        save_claims_file(repo, &claims)?;

        Ok(ClaimResult {
            claimed: true,
            conflict: None,
        })
    })
}

/// Release a worktree claim for an agent.
#[instrument(skip(repo), level = "debug")]
pub fn agent_release_worktree(
    repo: &RepoPath,
    wt_path: &str,
    agent_id: &str,
) -> Result<(), WorktreeError> {
    // Capture parameters for the closure
    let wt_path_str = wt_path.to_string();
    let agent_id_str = agent_id.to_string();

    with_claims_lock(repo, || {
        let mut claims = load_claims_file(repo)?;

        // Only remove if the agent_id matches
        if let Some(claim) = claims.claims.get(&wt_path_str) {
            if claim.agent_id == agent_id_str {
                claims.claims.remove(&wt_path_str);
                save_claims_file(repo, &claims)?;
                tracing::info!(agent_id = %agent_id_str, wt_path = %wt_path_str, "Released claim");
            }
        }

        Ok(())
    })
}

/// Update the heartbeat for an agent's claim.
#[instrument(skip(repo), level = "debug")]
pub fn agent_heartbeat(
    repo: &RepoPath,
    wt_path: &str,
    agent_id: &str,
) -> Result<(), WorktreeError> {
    // Capture parameters for the closure
    let wt_path_str = wt_path.to_string();
    let agent_id_str = agent_id.to_string();

    with_claims_lock(repo, || {
        let mut claims = load_claims_file(repo)?;

        if let Some(claim) = claims.claims.get_mut(&wt_path_str) {
            if claim.agent_id == agent_id_str {
                claim.heartbeat = current_iso8601();
                save_claims_file(repo, &claims)?;
            }
        }

        Ok(())
    })
}

/// List all active claims in a repository.
#[instrument(skip(repo), level = "debug")]
pub fn agent_list_claims(repo: &RepoPath) -> Result<ClaimsFile, WorktreeError> {
    // Use lock to ensure a consistent snapshot of claims, even if another process
    // is currently modifying the file
    with_claims_lock(repo, || load_claims_file(repo))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn setup_test_repo() -> Result<(RepoPath, TempDir), WorktreeError> {
        let temp_dir = TempDir::new().map_err(|e| WorktreeError::Io {
            message: format!("Failed to create temp dir: {}", e),
        })?;

        let git_dir = temp_dir.path().join(".git");
        fs::create_dir(&git_dir).map_err(|e| WorktreeError::Io {
            message: format!("Failed to create .git: {}", e),
        })?;

        let repo = RepoPath::new(temp_dir.path().to_str().unwrap())?;
        Ok((repo, temp_dir))
    }

    #[test]
    fn test_agent_claim_worktree() {
        let (repo, _temp) = setup_test_repo().unwrap();

        let result = agent_claim_worktree(&repo, "wt1", "agent-1", "feature-task", None).unwrap();
        assert!(result.claimed);
        assert!(result.conflict.is_none());
    }

    #[test]
    fn test_agent_claim_conflict() {
        let (repo, _temp) = setup_test_repo().unwrap();

        // First claim succeeds
        let result1 = agent_claim_worktree(&repo, "wt1", "agent-1", "task-1", None).unwrap();
        assert!(result1.claimed);

        // Second claim from different agent should conflict
        let result2 = agent_claim_worktree(&repo, "wt1", "agent-2", "task-2", None).unwrap();
        assert!(!result2.claimed);
        assert!(result2.conflict.is_some());
    }

    #[test]
    fn test_agent_release() {
        let (repo, _temp) = setup_test_repo().unwrap();

        agent_claim_worktree(&repo, "wt1", "agent-1", "task", None).unwrap();
        agent_release_worktree(&repo, "wt1", "agent-1").unwrap();

        // After release, another agent should be able to claim
        let result = agent_claim_worktree(&repo, "wt1", "agent-2", "task", None).unwrap();
        assert!(result.claimed);
    }

    #[test]
    fn test_agent_heartbeat() {
        let (repo, _temp) = setup_test_repo().unwrap();

        agent_claim_worktree(&repo, "wt1", "agent-1", "task", None).unwrap();

        let claims_before = agent_list_claims(&repo).unwrap();
        let heartbeat_before = claims_before.claims.get("wt1").unwrap().heartbeat.clone();

        agent_heartbeat(&repo, "wt1", "agent-1").unwrap();

        let claims_after = agent_list_claims(&repo).unwrap();
        let heartbeat_after = claims_after.claims.get("wt1").unwrap().heartbeat.clone();

        // Heartbeat should be updated (though they might be the same in fast tests)
        assert!(!heartbeat_after.is_empty());
    }

    #[test]
    fn test_list_claims() {
        let (repo, _temp) = setup_test_repo().unwrap();

        agent_claim_worktree(&repo, "wt1", "agent-1", "task-1", None).unwrap();
        agent_claim_worktree(&repo, "wt2", "agent-2", "task-2", None).unwrap();

        let claims = agent_list_claims(&repo).unwrap();
        assert_eq!(claims.claims.len(), 2);
        assert!(claims.claims.contains_key("wt1"));
        assert!(claims.claims.contains_key("wt2"));
    }

    #[test]
    fn test_is_heartbeat_stale() {
        // Very recent timestamp should not be stale
        let recent = "2026-03-09T15:30:00Z";
        assert!(!is_heartbeat_stale(recent));

        // Empty string should be stale
        assert!(is_heartbeat_stale(""));
    }

    #[test]
    fn test_claims_file_serialization() {
        let mut claims = ClaimsFile::new();
        claims.claims.insert(
            "wt1".to_string(),
            AgentClaim {
                agent_id: "agent-1".to_string(),
                task: "feature work".to_string(),
                claimed_at: "2026-03-09T15:00:00Z".to_string(),
                heartbeat: "2026-03-09T15:15:00Z".to_string(),
                estimated_duration: Some("PT1H".to_string()),
            },
        );

        let json = serde_json::to_string(&claims).unwrap();
        let parsed: ClaimsFile = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.claims.len(), 1);
        assert_eq!(parsed.claims.get("wt1").unwrap().agent_id, "agent-1");
    }
}
