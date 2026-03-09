use crate::{WorktreeError, RepoPath};
use crate::git::run_git;
use serde::{Deserialize, Serialize};
use tracing::instrument;

/// Risk level for a set of changes.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    /// Low risk changes (tests, docs)
    Low,
    /// Medium risk changes (features, config)
    Medium,
    /// High risk changes (migrations, auth, security)
    High,
}

/// A category of changed files with their paths.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileCategory {
    /// Category name (e.g., "database_changes")
    pub category: String,
    /// List of file paths in this category
    pub files: Vec<String>,
}

/// Analysis of a diff between branches.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffAnalysis {
    /// Human-readable summary of the changes
    pub summary: String,
    /// Overall risk level of the changes
    pub risk_level: RiskLevel,
    /// Factors that contributed to the risk level
    pub risk_factors: Vec<String>,
    /// Changes grouped by category
    pub categories: Vec<FileCategory>,
    /// List of potentially breaking changes
    pub breaking_changes: Vec<String>,
    /// Total number of changed files
    pub total_files: u32,
    /// Total number of lines added
    pub total_insertions: u32,
    /// Total number of lines deleted
    pub total_deletions: u32,
}

/// Categorize a file based on its path.
fn categorize_file(path: &str) -> Option<(String, RiskLevel)> {
    let lower = path.to_lowercase();

    // Database-related changes: HIGH risk
    if lower.contains("migration")
        || lower.contains("schema")
        || lower.contains("db/")
        || lower.ends_with(".sql")
    {
        return Some(("database_changes".to_string(), RiskLevel::High));
    }

    // Security/Auth: HIGH risk
    if lower.contains("auth")
        || lower.contains("security")
        || lower.contains("middleware")
        || lower.contains("permission")
        || lower.contains("crypto")
    {
        return Some(("security_changes".to_string(), RiskLevel::High));
    }

    // Tests: LOW risk
    if lower.contains("/test")
        || lower.contains("/__tests__")
        || lower.contains(".test.")
        || lower.contains(".spec.")
        || lower.contains("/tests/")
    {
        return Some(("test_changes".to_string(), RiskLevel::Low));
    }

    // Documentation: LOW risk
    if lower.contains("readme")
        || lower.contains("changelog")
        || lower.ends_with(".md")
        || lower.contains("/docs/")
        || lower.contains("documentation")
    {
        return Some(("documentation".to_string(), RiskLevel::Low));
    }

    // Config files: MEDIUM risk
    if lower.contains(".config")
        || lower.contains("config/")
        || lower.contains(".env")
        || lower.contains("settings")
    {
        return Some(("config_changes".to_string(), RiskLevel::Medium));
    }

    // Dependency files: MEDIUM risk
    if lower.ends_with("package.json")
        || lower.ends_with("package-lock.json")
        || lower.ends_with("yarn.lock")
        || lower.ends_with("Cargo.toml")
        || lower.ends_with("Cargo.lock")
        || lower.ends_with("go.mod")
        || lower.ends_with("go.sum")
        || lower.ends_with("requirements.txt")
        || lower.ends_with("pyproject.toml")
    {
        return Some(("dependency_changes".to_string(), RiskLevel::Medium));
    }

    // Core feature code: MEDIUM risk
    if lower.contains("/src/")
        || lower.contains("/lib/")
        || lower.contains("/app/")
        || lower.contains("/components/")
    {
        return Some(("feature_changes".to_string(), RiskLevel::Medium));
    }

    None
}

/// Analyze the diff between two branches.
#[instrument(skip(repo), level = "debug")]
pub fn analyze_diff(
    repo: &RepoPath,
    branch: &str,
    target: &str,
) -> Result<DiffAnalysis, WorktreeError> {
    // Get raw diff statistics with --numstat
    let diff_output = run_git(
        repo.as_path(),
        &["diff", "--numstat", &format!("{}...{}", target, branch)],
    )?;

    let mut files_by_category: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    let mut total_insertions = 0u32;
    let mut total_deletions = 0u32;
    let mut file_count = 0u32;
    let mut risk_per_category: std::collections::HashMap<String, RiskLevel> =
        std::collections::HashMap::new();

    // Parse numstat output: "insertions\tdeletions\tpath"
    for line in diff_output.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 3 {
            continue;
        }

        let insertions: u32 = parts[0].parse().unwrap_or(0);
        let deletions: u32 = parts[1].parse().unwrap_or(0);
        let path = parts[2];

        total_insertions += insertions;
        total_deletions += deletions;
        file_count += 1;

        // Categorize the file
        if let Some((category, risk)) = categorize_file(path) {
            files_by_category
                .entry(category.clone())
                .or_insert_with(Vec::new)
                .push(path.to_string());

            // Track max risk per category
            let current_max = risk_per_category.get(&category).copied().unwrap_or(RiskLevel::Low);
            let new_risk = match (current_max, risk) {
                (RiskLevel::High, _) => RiskLevel::High,
                (_, RiskLevel::High) => RiskLevel::High,
                (RiskLevel::Medium, _) => RiskLevel::Medium,
                (_, RiskLevel::Medium) => RiskLevel::Medium,
                _ => RiskLevel::Low,
            };
            risk_per_category.insert(category, new_risk);
        }
    }

    // Determine overall risk level
    let mut risk_level = RiskLevel::Low;
    let mut risk_factors = Vec::new();

    // Check for high-risk categories
    let has_high_risk = files_by_category.iter().any(|(cat, _)| {
        risk_per_category
            .get(cat)
            .map(|r| *r == RiskLevel::High)
            .unwrap_or(false)
    });

    if has_high_risk {
        risk_level = RiskLevel::High;
        risk_factors.push("Contains high-risk categories (migrations, auth, security)".to_string());
    }

    // Large changes increase risk
    if file_count > 20 {
        if risk_level == RiskLevel::Low {
            risk_level = RiskLevel::Medium;
        }
        risk_factors.push(format!("Large changeset: {} files modified", file_count));
    }

    if total_insertions + total_deletions > 1000 {
        if risk_level == RiskLevel::Low {
            risk_level = RiskLevel::Medium;
        }
        risk_factors.push(format!(
            "Substantial code changes: {} insertions, {} deletions",
            total_insertions, total_deletions
        ));
    }

    // Check for breaking changes (heuristic)
    let mut breaking_changes = Vec::new();
    if let Some(removed) = files_by_category.get("database_changes") {
        if !removed.is_empty() {
            breaking_changes.push(
                "Database migrations detected - verify backward compatibility".to_string(),
            );
        }
    }
    if let Some(sec) = files_by_category.get("security_changes") {
        if !sec.is_empty() {
            breaking_changes.push("Security changes detected - requires careful review".to_string());
        }
    }

    // Build categories list
    let categories: Vec<FileCategory> = files_by_category
        .into_iter()
        .map(|(category, files)| FileCategory {
            category,
            files: files.into_iter().take(10).collect(), // Limit to first 10 files per category
        })
        .collect();

    // Generate summary
    let summary = format!(
        "Analyzed {} changed file(s) with {} insertions and {} deletions. \
         Risk level: {:?}. {}",
        file_count,
        total_insertions,
        total_deletions,
        risk_level,
        if !breaking_changes.is_empty() {
            format!("Warning: {}", breaking_changes.join("; "))
        } else {
            "No obvious breaking changes detected.".to_string()
        }
    );

    Ok(DiffAnalysis {
        summary,
        risk_level,
        risk_factors,
        categories,
        breaking_changes,
        total_files: file_count,
        total_insertions,
        total_deletions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_categorize_file_migrations() {
        let (cat, risk) = categorize_file("db/migrations/001_init.sql").unwrap();
        assert_eq!(cat, "database_changes");
        assert_eq!(risk, RiskLevel::High);
    }

    #[test]
    fn test_categorize_file_auth() {
        let (cat, risk) = categorize_file("src/auth/login.rs").unwrap();
        assert_eq!(cat, "security_changes");
        assert_eq!(risk, RiskLevel::High);
    }

    #[test]
    fn test_categorize_file_tests() {
        let (cat, risk) = categorize_file("src/__tests__/main.test.js").unwrap();
        assert_eq!(cat, "test_changes");
        assert_eq!(risk, RiskLevel::Low);
    }

    #[test]
    fn test_categorize_file_docs() {
        let (cat, risk) = categorize_file("README.md").unwrap();
        assert_eq!(cat, "documentation");
        assert_eq!(risk, RiskLevel::Low);
    }

    #[test]
    fn test_categorize_file_config() {
        let (cat, risk) = categorize_file(".env.production").unwrap();
        assert_eq!(cat, "config_changes");
        assert_eq!(risk, RiskLevel::Medium);
    }

    #[test]
    fn test_categorize_file_dependencies() {
        let (cat, risk) = categorize_file("package.json").unwrap();
        assert_eq!(cat, "dependency_changes");
        assert_eq!(risk, RiskLevel::Medium);
    }

    #[test]
    fn test_categorize_file_src() {
        let (cat, risk) = categorize_file("src/main.rs").unwrap();
        assert_eq!(cat, "feature_changes");
        assert_eq!(risk, RiskLevel::Medium);
    }

    #[test]
    fn test_categorize_file_unknown() {
        let result = categorize_file("random_file.tmp");
        assert!(result.is_none());
    }

    #[test]
    fn test_diff_analysis_serialization() {
        let analysis = DiffAnalysis {
            summary: "Test summary".to_string(),
            risk_level: RiskLevel::High,
            risk_factors: vec!["Factor 1".to_string()],
            categories: vec![FileCategory {
                category: "database_changes".to_string(),
                files: vec!["migration.sql".to_string()],
            }],
            breaking_changes: vec!["Breaking change 1".to_string()],
            total_files: 5,
            total_insertions: 100,
            total_deletions: 50,
        };

        let json = serde_json::to_string(&analysis).unwrap();
        let parsed: DiffAnalysis = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.total_files, 5);
        assert_eq!(parsed.risk_level, RiskLevel::High);
    }
}
