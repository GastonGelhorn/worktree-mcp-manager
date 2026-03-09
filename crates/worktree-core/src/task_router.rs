use crate::{WorktreeError, RepoPath};
use crate::git::run_git;
use serde::{Deserialize, Serialize};
use tracing::instrument;

/// Recommendation for how to proceed with a task.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Recommendation {
    /// Use an existing worktree that matches the task
    UseExisting,
    /// Create a new worktree for this task
    CreateNew,
}

/// A worktree that matches the task description.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeMatch {
    /// Path to the worktree
    pub path: String,
    /// Current branch name
    pub branch: String,
    /// Relevance score (0-100)
    pub relevance_score: u32,
    /// Why this worktree was suggested
    pub reason: String,
}

/// Suggestion for which worktree to use for a task.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSuggestion {
    /// Recommendation: use existing or create new
    pub recommendation: Recommendation,
    /// Path to the suggested worktree (if UseExisting)
    pub worktree_path: Option<String>,
    /// Suggested branch name for the task
    pub suggested_branch: String,
    /// Explanation of the recommendation
    pub reasoning: String,
    /// All matching worktrees, sorted by relevance
    pub matches: Vec<WorktreeMatch>,
}

/// Sanitize a task description into a valid git branch name.
fn sanitize_branch_name(description: &str) -> String {
    description
        .to_lowercase()
        .split_whitespace()
        .take(3) // Limit to first 3 words
        .map(|word| {
            // Remove non-alphanumeric characters
            word.chars()
                .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
                .collect::<String>()
        })
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// Calculate keyword relevance between a branch name and task description.
fn calculate_relevance(branch: &str, task: &str) -> u32 {
    let branch_lower = branch.to_lowercase();
    let task_lower = task.to_lowercase();

    // Split into words
    let task_words: Vec<&str> = task_lower.split_whitespace().collect();
    let branch_words: Vec<&str> = branch_lower.split('-').collect();

    // Count matching words
    let mut matches = 0;
    for bword in &branch_words {
        for tword in &task_words {
            if bword.contains(tword) || tword.contains(bword) {
                matches += 1;
            }
        }
    }

    // Score is matches * 25, capped at 100
    std::cmp::min(matches as u32 * 25, 100)
}

/// Parse worktree list output to extract information.
fn parse_worktree_list(output: &str) -> Result<Vec<(String, String)>, WorktreeError> {
    let mut worktrees = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Format: worktree <path> (with --porcelain) or path is first field
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        if parts[0] == "worktree" && parts.len() > 1 {
            let path = parts[1].to_string();
            // Branch will be parsed from next line
            worktrees.push((path, String::new()));
        }
    }

    Ok(worktrees)
}

/// Get the current branch for a worktree.
fn get_branch_for_worktree(worktree_path: &str) -> Result<String, WorktreeError> {
    let output = run_git(
        std::path::Path::new(worktree_path),
        &["rev-parse", "--abbrev-ref", "HEAD"],
    )?;

    Ok(output.trim().to_string())
}

/// Check if a worktree has uncommitted changes.
fn is_worktree_dirty(worktree_path: &str) -> Result<bool, WorktreeError> {
    let output = run_git(
        std::path::Path::new(worktree_path),
        &["status", "--porcelain"],
    )?;

    Ok(!output.trim().is_empty())
}

/// Suggest the best worktree for a given task.
///
/// Lists existing worktrees and computes relevance scores based on keyword
/// matching with the task description. If the best match scores > 70 and is clean,
/// recommends using it. Otherwise, recommends creating a new worktree.
#[instrument(skip(repo), level = "debug")]
pub fn suggest_worktree(
    repo: &RepoPath,
    task_description: &str,
) -> Result<TaskSuggestion, WorktreeError> {
    // Generate suggested branch name from task
    let suggested_branch = sanitize_branch_name(task_description);
    if suggested_branch.is_empty() {
        return Err(WorktreeError::Other {
            message: "Task description too vague to generate branch name".to_string(),
        });
    }

    // List existing worktrees
    let output = match run_git(repo.as_path(), &["worktree", "list", "--porcelain"]) {
        Ok(out) => out,
        Err(_) => {
            // If worktree list fails, return suggestion to create new
            return Ok(TaskSuggestion {
                recommendation: Recommendation::CreateNew,
                worktree_path: None,
                suggested_branch,
                reasoning: "No existing worktrees found or unable to list them.".to_string(),
                matches: vec![],
            });
        }
    };

    // Parse worktrees
    let mut matches = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Format with --porcelain: worktree <path>
        if line.starts_with("worktree ") {
            let path = line.strip_prefix("worktree ").unwrap_or("").to_string();
            if path.is_empty() {
                continue;
            }

            // Get branch name
            let branch = match get_branch_for_worktree(&path) {
                Ok(b) => b,
                Err(_) => continue,
            };

            // Calculate relevance
            let relevance_score = calculate_relevance(&branch, task_description);

            // Only include matches with some relevance or that are very clean
            if relevance_score > 0 {
                let is_dirty = is_worktree_dirty(&path).unwrap_or(true);
                let reason = if relevance_score > 50 {
                    format!("Branch '{}' matches task keywords", branch)
                } else {
                    format!("Branch '{}' has some relevance", branch)
                };

                matches.push((path, branch, relevance_score, is_dirty, reason));
            }
        }
    }

    // Sort by relevance score descending
    matches.sort_by(|a, b| b.2.cmp(&a.2));

    let worktree_matches: Vec<WorktreeMatch> = matches
        .iter()
        .map(|(path, branch, score, _, reason)| WorktreeMatch {
            path: path.clone(),
            branch: branch.clone(),
            relevance_score: *score,
            reason: reason.clone(),
        })
        .collect();

    // Decide on recommendation
    let recommendation;
    let worktree_path;
    let reasoning;

    if let Some((path, branch, score, is_dirty, _)) = matches.first() {
        if *score > 70 && !is_dirty {
            // Strong match and clean - use existing
            recommendation = Recommendation::UseExisting;
            worktree_path = Some(path.clone());
            reasoning = format!(
                "Found excellent match: worktree at '{}' on branch '{}' (relevance: {}%). \
                 The worktree is clean and ready to use.",
                path, branch, score
            );
        } else if *score > 50 {
            // Decent match but either dirty or lower score
            recommendation = if *is_dirty {
                Recommendation::CreateNew
            } else {
                Recommendation::UseExisting
            };

            let status = if *is_dirty { "has uncommitted changes" } else { "is clean" };
            worktree_path = if recommendation == Recommendation::UseExisting {
                Some(path.clone())
            } else {
                None
            };

            reasoning = format!(
                "Found partial match: worktree at '{}' on branch '{}' (relevance: {}%), but it {}. {}",
                path,
                branch,
                score,
                status,
                if recommendation == Recommendation::UseExisting {
                    "Using existing worktree.".to_string()
                } else {
                    "Recommend creating a new worktree to avoid interference.".to_string()
                }
            );
        } else {
            // Low relevance - create new
            recommendation = Recommendation::CreateNew;
            worktree_path = None;
            reasoning = format!(
                "Existing worktrees have low relevance to this task. \
                 Recommend creating a new worktree on branch '{}'.",
                suggested_branch
            );
        }
    } else {
        // No existing worktrees
        recommendation = Recommendation::CreateNew;
        worktree_path = None;
        reasoning = format!(
            "No existing worktrees found. Create a new one on branch '{}'.",
            suggested_branch
        );
    }

    Ok(TaskSuggestion {
        recommendation,
        worktree_path,
        suggested_branch,
        reasoning,
        matches: worktree_matches,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_branch_name_simple() {
        let result = sanitize_branch_name("Add user authentication");
        assert_eq!(result, "add-user-authentication");
    }

    #[test]
    fn test_sanitize_branch_name_with_punctuation() {
        let result = sanitize_branch_name("Fix: bug in login system!");
        assert!(result.contains("fix"));
        assert!(result.contains("bug"));
    }

    #[test]
    fn test_sanitize_branch_name_limit_words() {
        let result = sanitize_branch_name("This is a very long task description");
        let parts: Vec<&str> = result.split('-').collect();
        assert!(parts.len() <= 3);
    }

    #[test]
    fn test_calculate_relevance_exact_match() {
        let score = calculate_relevance("auth-feature", "work on auth");
        assert!(score > 50);
    }

    #[test]
    fn test_calculate_relevance_no_match() {
        let score = calculate_relevance("database-migration", "ui component work");
        assert!(score == 0);
    }

    #[test]
    fn test_calculate_relevance_partial_match() {
        let score = calculate_relevance("feature-auth", "implementing auth");
        assert!(score > 0);
    }

    #[test]
    fn test_task_suggestion_serialization() {
        let suggestion = TaskSuggestion {
            recommendation: Recommendation::CreateNew,
            worktree_path: None,
            suggested_branch: "feature-auth".to_string(),
            reasoning: "No matching worktrees".to_string(),
            matches: vec![],
        };

        let json = serde_json::to_string(&suggestion).unwrap();
        let parsed: TaskSuggestion = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.recommendation, Recommendation::CreateNew);
        assert_eq!(parsed.suggested_branch, "feature-auth");
    }

    #[test]
    fn test_worktree_match_serialization() {
        let m = WorktreeMatch {
            path: "/path/to/wt".to_string(),
            branch: "feature-branch".to_string(),
            relevance_score: 85,
            reason: "Strong keyword match".to_string(),
        };

        let json = serde_json::to_string(&m).unwrap();
        let parsed: WorktreeMatch = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.path, "/path/to/wt");
        assert_eq!(parsed.relevance_score, 85);
    }
}
