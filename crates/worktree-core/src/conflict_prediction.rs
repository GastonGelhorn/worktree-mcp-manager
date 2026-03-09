use crate::{WorktreeError, RepoPath};
use crate::git::run_git;
use serde::{Deserialize, Serialize};
use tracing::instrument;

/// Severity of a predicted conflict.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConflictSeverity {
    /// Conflicts that can likely be resolved automatically
    AutoResolvable,
    /// Conflicts that require manual intervention
    ManualRequired,
}

/// Information about a file that will likely have conflicts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictFile {
    /// Path to the conflicting file
    pub path: String,
    /// Severity of the conflict
    pub severity: ConflictSeverity,
}

/// Prediction of merge conflicts between two branches.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictPrediction {
    /// Whether conflicts will occur during merge
    pub will_conflict: bool,
    /// List of files that will have conflicts
    pub conflicting_files: Vec<ConflictFile>,
    /// Recommendation for how to proceed
    pub recommendation: String,
}

/// Determine if a file path suggests a particular conflict type.
fn categorize_file(path: &str) -> ConflictSeverity {
    let lower = path.to_lowercase();

    // Whitespace and import-only changes are often auto-resolvable
    if lower.ends_with(".lock")
        || lower.ends_with(".json")
        || lower.contains("package-lock")
        || lower.contains("yarn.lock")
        || lower.contains("Cargo.lock")
    {
        return ConflictSeverity::AutoResolvable;
    }

    // Most code conflicts require manual review
    ConflictSeverity::ManualRequired
}

/// Predict merge conflicts without modifying the working directory.
///
/// Uses `git merge-tree --write-tree --name-only` to analyze the merge
/// without actually performing it. Returns a ConflictPrediction with details
/// about which files will conflict and their severity.
#[instrument(skip(repo), level = "debug")]
pub fn predict_conflicts(
    repo: &RepoPath,
    branch: &str,
    target: &str,
) -> Result<ConflictPrediction, WorktreeError> {
    // Use merge-tree to detect conflicts without modifying the tree
    let output = match run_git(
        repo.as_path(),
        &["merge-tree", "--write-tree", "--name-only", target, branch],
    ) {
        Ok(out) => out,
        Err(e) => {
            // merge-tree exits with 1 if there are conflicts, which is not an error condition
            // Check if the error message indicates conflicts
            if let WorktreeError::Git { ref message } = e {
                if message.contains("CONFLICT") || message.is_empty() {
                    // This is expected for conflicted merges
                    String::new()
                } else {
                    return Err(e);
                }
            } else {
                return Err(e);
            }
        }
    };

    // Parse the output to identify conflicting files
    let mut conflicting_files = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Lines with CONFLICT indicate conflicting files
        if line.contains("CONFLICT") {
            // Extract the file path from lines like:
            // CONFLICT (content): path/to/file
            if let Some(path_start) = line.find("(content):") {
                let path = line[path_start + 10..].trim();
                let severity = categorize_file(path);
                conflicting_files.push(ConflictFile {
                    path: path.to_string(),
                    severity,
                });
            } else if let Some(path_start) = line.find("(delete/modify):") {
                let path = line[path_start + 15..].trim();
                conflicting_files.push(ConflictFile {
                    path: path.to_string(),
                    severity: ConflictSeverity::ManualRequired,
                });
            } else if let Some(path_start) = line.find("(modify/delete):") {
                let path = line[path_start + 15..].trim();
                conflicting_files.push(ConflictFile {
                    path: path.to_string(),
                    severity: ConflictSeverity::ManualRequired,
                });
            } else if let Some(path_start) = line.find("(add/add):") {
                let path = line[path_start + 10..].trim();
                conflicting_files.push(ConflictFile {
                    path: path.to_string(),
                    severity: ConflictSeverity::ManualRequired,
                });
            }
        }
    }

    let will_conflict = !conflicting_files.is_empty();

    let recommendation = if will_conflict {
        let manual_count = conflicting_files
            .iter()
            .filter(|f| f.severity == ConflictSeverity::ManualRequired)
            .count();

        if manual_count > 0 {
            format!(
                "Merge will have {} conflicting file(s). {} file(s) require manual intervention. \
                 Review and resolve conflicts before proceeding.",
                conflicting_files.len(),
                manual_count
            )
        } else {
            format!(
                "Merge will have {} conflicting file(s), but all can likely be auto-resolved.",
                conflicting_files.len()
            )
        }
    } else {
        "Merge can be completed cleanly without conflicts.".to_string()
    };

    Ok(ConflictPrediction {
        will_conflict,
        conflicting_files,
        recommendation,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_categorize_file_lock_files() {
        assert_eq!(
            categorize_file("package-lock.json"),
            ConflictSeverity::AutoResolvable
        );
        assert_eq!(
            categorize_file("Cargo.lock"),
            ConflictSeverity::AutoResolvable
        );
        assert_eq!(
            categorize_file("yarn.lock"),
            ConflictSeverity::AutoResolvable
        );
    }

    #[test]
    fn test_categorize_file_code_files() {
        assert_eq!(
            categorize_file("src/main.rs"),
            ConflictSeverity::ManualRequired
        );
        assert_eq!(
            categorize_file("lib/index.js"),
            ConflictSeverity::ManualRequired
        );
        assert_eq!(
            categorize_file("app.py"),
            ConflictSeverity::ManualRequired
        );
    }

    #[test]
    fn test_conflict_prediction_no_conflicts() {
        let pred = ConflictPrediction {
            will_conflict: false,
            conflicting_files: vec![],
            recommendation: "Merge can be completed cleanly without conflicts.".to_string(),
        };

        assert!(!pred.will_conflict);
        assert_eq!(pred.conflicting_files.len(), 0);
    }

    #[test]
    fn test_conflict_prediction_with_conflicts() {
        let pred = ConflictPrediction {
            will_conflict: true,
            conflicting_files: vec![
                ConflictFile {
                    path: "src/main.rs".to_string(),
                    severity: ConflictSeverity::ManualRequired,
                },
                ConflictFile {
                    path: "Cargo.lock".to_string(),
                    severity: ConflictSeverity::AutoResolvable,
                },
            ],
            recommendation: "Review conflicts".to_string(),
        };

        assert!(pred.will_conflict);
        assert_eq!(pred.conflicting_files.len(), 2);
    }

    #[test]
    fn test_conflict_file_serialization() {
        let file = ConflictFile {
            path: "src/main.rs".to_string(),
            severity: ConflictSeverity::ManualRequired,
        };

        let json = serde_json::to_string(&file).unwrap();
        let parsed: ConflictFile = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.path, "src/main.rs");
        assert_eq!(parsed.severity, ConflictSeverity::ManualRequired);
    }
}
