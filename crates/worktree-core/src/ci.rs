use crate::{WorktreeError, RepoPath};
use crate::git::run_git;
use crate::git::run_external;
use serde::{Deserialize, Serialize};
use tracing::instrument;

/// Detected CI/CD provider.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CiProvider {
    /// GitHub (github.com)
    GitHub,
    /// GitLab (gitlab.com)
    GitLab,
    /// Unknown or unsupported provider
    Unknown,
}

/// Status of CI/CD checks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CiStatus {
    /// All checks passed.
    Passed,
    /// One or more checks failed.
    Failed,
    /// Checks are currently running.
    Running,
    /// Checks are queued or waiting to start.
    Pending,
    /// No checks have been run.
    None,
}

/// Code review status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReviewStatus {
    /// All reviewers approved.
    Approved,
    /// At least one reviewer requested changes.
    ChangesRequested,
    /// Awaiting review.
    Pending,
    /// No review requested or applicable.
    None,
}

/// Individual CI check result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CiCheck {
    /// Name of the check (e.g., "build", "tests", "lint").
    pub name: String,
    /// Current status of the check.
    pub status: CiStatus,
    /// URL to the check details, if available.
    pub url: Option<String>,
    /// Brief summary of the check result.
    pub summary: Option<String>,
}

/// Complete CI/CD status information for a branch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CiResult {
    /// The detected CI provider.
    pub provider: CiProvider,
    /// The branch being checked.
    pub branch: String,
    /// Associated PR/MR number, if one exists.
    pub pr_number: Option<u32>,
    /// URL to the PR/MR, if one exists.
    pub pr_url: Option<String>,
    /// Overall CI status.
    pub ci_status: CiStatus,
    /// Individual check results.
    pub checks: Vec<CiCheck>,
    /// Whether the branch can be merged (based on CI).
    pub is_mergeable: bool,
    /// Review status from pull request/merge request.
    pub review_status: ReviewStatus,
    /// Whether the CI result is stale (branch has new commits).
    pub stale: bool,
}

/// Detect the CI provider based on the repository remote URL.
#[instrument(skip_all, fields(repo = %repo))]
pub fn detect_provider(repo: &RepoPath) -> Result<CiProvider, WorktreeError> {
    let repo_path = repo.as_path();

    let output = run_git(repo_path, &["config", "--get", "remote.origin.url"])
        .map_err(|_| WorktreeError::Git {
            message: "Could not read remote.origin.url".to_string(),
        })?;

    let url = output.trim().to_lowercase();

    if url.contains("github.com") {
        Ok(CiProvider::GitHub)
    } else if url.contains("gitlab.com") {
        Ok(CiProvider::GitLab)
    } else {
        Ok(CiProvider::Unknown)
    }
}

/// Get the CI status for a branch.
///
/// For GitHub: Uses `gh pr view` to query PR status and checks.
/// For GitLab: Uses `glab mr view` to query MR status.
/// Returns gracefully if no PR/MR exists.
#[instrument(skip_all, fields(repo = %repo, branch = %branch))]
pub fn get_ci_status(repo: &RepoPath, branch: &str) -> Result<CiResult, WorktreeError> {
    let repo_path = repo.as_path();
    let provider = detect_provider(repo)?;

    match provider {
        CiProvider::GitHub => get_github_ci_status(repo_path, branch),
        CiProvider::GitLab => get_gitlab_ci_status(repo_path, branch),
        CiProvider::Unknown => Ok(CiResult {
            provider: CiProvider::Unknown,
            branch: branch.to_string(),
            pr_number: None,
            pr_url: None,
            ci_status: CiStatus::None,
            checks: Vec::new(),
            is_mergeable: false,
            review_status: ReviewStatus::None,
            stale: false,
        }),
    }
}

/// Get CI status from GitHub using `gh` CLI.
fn get_github_ci_status(repo_path: &std::path::Path, branch: &str) -> Result<CiResult, WorktreeError> {
    // Query for a PR on this branch
    let pr_output = run_external(
        "gh",
        repo_path,
        &[
            "pr",
            "view",
            branch,
            "--json",
            "number,url,state,statusCheckRollup,reviewDecision,mergeable",
            "-q",
            ".",
        ],
    );

    match pr_output {
        Ok(json_str) => {
            // Parse the JSON response
            parse_github_pr_response(&json_str, branch)
        }
        Err(_) => {
            // No PR found for this branch
            Ok(CiResult {
                provider: CiProvider::GitHub,
                branch: branch.to_string(),
                pr_number: None,
                pr_url: None,
                ci_status: CiStatus::None,
                checks: Vec::new(),
                is_mergeable: false,
                review_status: ReviewStatus::None,
                stale: check_stale(repo_path, branch).unwrap_or(false),
            })
        }
    }
}

/// Get CI status from GitLab using `glab` CLI.
fn get_gitlab_ci_status(repo_path: &std::path::Path, branch: &str) -> Result<CiResult, WorktreeError> {
    // Query for an MR on this branch
    let mr_output = run_external(
        "glab",
        repo_path,
        &[
            "mr",
            "view",
            branch,
            "--json",
            "iid,webUrl,state,pipeline,approvals_before_merge",
            "-q",
            ".",
        ],
    );

    match mr_output {
        Ok(json_str) => {
            // Parse the JSON response
            parse_gitlab_mr_response(&json_str, branch)
        }
        Err(_) => {
            // No MR found for this branch
            Ok(CiResult {
                provider: CiProvider::GitLab,
                branch: branch.to_string(),
                pr_number: None,
                pr_url: None,
                ci_status: CiStatus::None,
                checks: Vec::new(),
                is_mergeable: false,
                review_status: ReviewStatus::None,
                stale: check_stale(repo_path, branch).unwrap_or(false),
            })
        }
    }
}

/// Parse GitHub PR response (simplified JSON parsing without external deps).
fn parse_github_pr_response(json: &str, branch: &str) -> Result<CiResult, WorktreeError> {
    // Simplified parsing without serde_json dependency
    // Extract values using string matching
    let mut pr_number = None;
    let mut pr_url = None;
    let mut ci_status = CiStatus::None;
    let checks = Vec::new();
    let mut is_mergeable = false;
    let mut review_status = ReviewStatus::None;

    // Parse number: "number": 123
    if let Some(start) = json.find("\"number\"") {
        if let Some(colon) = json[start..].find(':') {
            let num_str = json[start + colon + 1..]
                .split(|c: char| !c.is_numeric())
                .next()
                .unwrap_or("0");
            if let Ok(num) = num_str.parse::<u32>() {
                pr_number = Some(num);
            }
        }
    }

    // Parse URL: "url": "https://..."
    if let Some(start) = json.find("\"url\"") {
        if let Some(quote) = json[start..].find('"').and_then(|i| {
            json[start + i + 1..].find('"').map(|j| i + j + 1)
        }) {
            let url_start = start + quote + 1;
            if let Some(url_end) = json[url_start..].find('"') {
                pr_url = Some(json[url_start..url_start + url_end].to_string());
            }
        }
    }

    // Parse mergeable: "mergeable": "MERGEABLE"
    if json.contains("\"mergeable\":\"MERGEABLE\"") {
        is_mergeable = true;
    }

    // Parse state: "state": "OPEN"
    if json.contains("\"state\":\"MERGED\"") {
        review_status = ReviewStatus::Approved;
    } else if json.contains("\"reviewDecision\":\"CHANGES_REQUESTED\"") {
        review_status = ReviewStatus::ChangesRequested;
    } else if json.contains("\"reviewDecision\":\"APPROVED\"") {
        review_status = ReviewStatus::Approved;
    } else if json.contains("\"state\":\"OPEN\"") {
        review_status = ReviewStatus::Pending;
    }

    // Determine overall CI status from checks (simplified)
    if json.contains("\"conclusion\":\"SUCCESS\"") {
        ci_status = CiStatus::Passed;
    } else if json.contains("\"conclusion\":\"FAILURE\"") {
        ci_status = CiStatus::Failed;
    } else if json.contains("\"status\":\"IN_PROGRESS\"") {
        ci_status = CiStatus::Running;
    } else if pr_number.is_some() {
        ci_status = CiStatus::Pending;
    }

    Ok(CiResult {
        provider: CiProvider::GitHub,
        branch: branch.to_string(),
        pr_number,
        pr_url,
        ci_status,
        checks,
        is_mergeable,
        review_status,
        stale: false,
    })
}

/// Parse GitLab MR response (simplified JSON parsing).
fn parse_gitlab_mr_response(json: &str, branch: &str) -> Result<CiResult, WorktreeError> {
    let mut pr_number = None;
    let mut pr_url = None;
    let mut ci_status = CiStatus::None;
    let mut is_mergeable = false;
    let mut review_status = ReviewStatus::None;

    // Parse iid (MR number): "iid": 45
    if let Some(start) = json.find("\"iid\"") {
        if let Some(colon) = json[start..].find(':') {
            let num_str = json[start + colon + 1..]
                .split(|c: char| !c.is_numeric())
                .next()
                .unwrap_or("0");
            if let Ok(num) = num_str.parse::<u32>() {
                pr_number = Some(num);
            }
        }
    }

    // Parse webUrl
    if let Some(start) = json.find("\"webUrl\"") {
        if let Some(quote) = json[start..].find('"').and_then(|i| {
            json[start + i + 1..].find('"').map(|j| i + j + 1)
        }) {
            let url_start = start + quote + 1;
            if let Some(url_end) = json[url_start..].find('"') {
                pr_url = Some(json[url_start..url_start + url_end].to_string());
            }
        }
    }

    // Parse state: "state": "merged"
    if json.contains("\"state\":\"merged\"") {
        is_mergeable = true;
        review_status = ReviewStatus::Approved;
    } else if json.contains("\"state\":\"opened\"") {
        review_status = ReviewStatus::Pending;
    }

    // Parse pipeline status
    if json.contains("\"status\":\"success\"") {
        ci_status = CiStatus::Passed;
    } else if json.contains("\"status\":\"failed\"") {
        ci_status = CiStatus::Failed;
    } else if json.contains("\"status\":\"running\"") {
        ci_status = CiStatus::Running;
    } else if pr_number.is_some() {
        ci_status = CiStatus::Pending;
    }

    Ok(CiResult {
        provider: CiProvider::GitLab,
        branch: branch.to_string(),
        pr_number,
        pr_url,
        ci_status,
        checks: Vec::new(),
        is_mergeable,
        review_status,
        stale: false,
    })
}

/// Check if the branch is stale (has commits not in origin).
fn check_stale(repo_path: &std::path::Path, branch: &str) -> Result<bool, WorktreeError> {
    match run_git(
        repo_path,
        &["log", "--oneline", &format!("origin/{}..{}", branch, branch)],
    ) {
        Ok(output) => Ok(!output.trim().is_empty()),
        Err(_) => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ci_provider_enum() {
        assert_eq!(CiProvider::GitHub, CiProvider::GitHub);
        assert_ne!(CiProvider::GitHub, CiProvider::GitLab);
    }

    #[test]
    fn test_ci_status_enum() {
        assert_eq!(CiStatus::Passed, CiStatus::Passed);
        assert_ne!(CiStatus::Passed, CiStatus::Failed);
    }

    #[test]
    fn test_review_status_enum() {
        assert_eq!(ReviewStatus::Approved, ReviewStatus::Approved);
        assert_ne!(ReviewStatus::Approved, ReviewStatus::Pending);
    }

    #[test]
    fn test_ci_check_structure() {
        let check = CiCheck {
            name: "tests".to_string(),
            status: CiStatus::Passed,
            url: Some("https://github.com/repo/runs/123".to_string()),
            summary: Some("All tests passed".to_string()),
        };

        assert_eq!(check.name, "tests");
        assert_eq!(check.status, CiStatus::Passed);
        assert!(check.url.is_some());
    }

    #[test]
    fn test_ci_result_structure() {
        let result = CiResult {
            provider: CiProvider::GitHub,
            branch: "feature/login".to_string(),
            pr_number: Some(42),
            pr_url: Some("https://github.com/repo/pull/42".to_string()),
            ci_status: CiStatus::Running,
            checks: vec![
                CiCheck {
                    name: "tests".to_string(),
                    status: CiStatus::Passed,
                    url: None,
                    summary: None,
                },
                CiCheck {
                    name: "lint".to_string(),
                    status: CiStatus::Running,
                    url: None,
                    summary: None,
                },
            ],
            is_mergeable: false,
            review_status: ReviewStatus::Pending,
            stale: false,
        };

        assert_eq!(result.provider, CiProvider::GitHub);
        assert_eq!(result.branch, "feature/login");
        assert_eq!(result.pr_number, Some(42));
        assert_eq!(result.checks.len(), 2);
    }

    #[test]
    fn test_ci_result_merged() {
        let result = CiResult {
            provider: CiProvider::GitHub,
            branch: "feature/old".to_string(),
            pr_number: Some(10),
            pr_url: None,
            ci_status: CiStatus::Passed,
            checks: Vec::new(),
            is_mergeable: true,
            review_status: ReviewStatus::Approved,
            stale: false,
        };

        assert!(result.is_mergeable);
        assert_eq!(result.review_status, ReviewStatus::Approved);
    }

    #[test]
    fn test_ci_result_no_pr() {
        let result = CiResult {
            provider: CiProvider::GitHub,
            branch: "local-only".to_string(),
            pr_number: None,
            pr_url: None,
            ci_status: CiStatus::None,
            checks: Vec::new(),
            is_mergeable: false,
            review_status: ReviewStatus::None,
            stale: false,
        };

        assert!(result.pr_number.is_none());
        assert_eq!(result.ci_status, CiStatus::None);
    }

    #[test]
    fn test_parse_github_pr_number() {
        let json = r#"{"number":123,"url":"https://github.com/repo/pull/123"}"#;
        let result = parse_github_pr_response(json, "feature").unwrap();
        assert_eq!(result.pr_number, Some(123));
    }

    #[test]
    fn test_parse_gitlab_mr_number() {
        let json = r#"{"iid":45,"webUrl":"https://gitlab.com/repo/-/merge_requests/45"}"#;
        let result = parse_gitlab_mr_response(json, "feature").unwrap();
        assert_eq!(result.pr_number, Some(45));
    }

    #[test]
    fn test_all_ci_status_values() {
        let statuses = vec![
            CiStatus::Passed,
            CiStatus::Failed,
            CiStatus::Running,
            CiStatus::Pending,
            CiStatus::None,
        ];

        for status in statuses {
            match status {
                CiStatus::Passed => assert_eq!(status, CiStatus::Passed),
                CiStatus::Failed => assert_eq!(status, CiStatus::Failed),
                CiStatus::Running => assert_eq!(status, CiStatus::Running),
                CiStatus::Pending => assert_eq!(status, CiStatus::Pending),
                CiStatus::None => assert_eq!(status, CiStatus::None),
            }
        }
    }

    #[test]
    fn test_all_review_status_values() {
        let statuses = vec![
            ReviewStatus::Approved,
            ReviewStatus::ChangesRequested,
            ReviewStatus::Pending,
            ReviewStatus::None,
        ];

        for status in statuses {
            match status {
                ReviewStatus::Approved => assert_eq!(status, ReviewStatus::Approved),
                ReviewStatus::ChangesRequested => assert_eq!(status, ReviewStatus::ChangesRequested),
                ReviewStatus::Pending => assert_eq!(status, ReviewStatus::Pending),
                ReviewStatus::None => assert_eq!(status, ReviewStatus::None),
            }
        }
    }
}
