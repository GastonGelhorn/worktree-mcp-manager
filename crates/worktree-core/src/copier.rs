use crate::WorktreeError;
use std::fs;
use std::path::Path;
use std::process::Command;
use tracing::instrument;
use serde::{Deserialize, Serialize};

pub fn copy_project_configs(source_dir: &str, dest_dir: &str) -> Result<(), WorktreeError> {
    let source = Path::new(source_dir);
    let dest = Path::new(dest_dir);

    let output = Command::new("git")
        .current_dir(source_dir)
        .arg("ls-files")
        .arg("-o")
        .arg("--directory")
        .output()?;

    if !output.status.success() {
        return Ok(());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    for line in stdout.lines() {
        let target = line.trim();
        if target.is_empty() {
            continue;
        }

        let src_path = source.join(target);
        let dst_path = dest.join(target);

        if src_path.exists() {
            if let Some(parent) = dst_path.parent() {
                let _ = fs::create_dir_all(parent);
            }

            // Use `cp -a` for native speed. On macOS APFS this triggers copy-on-write.
            match Command::new("cp")
                .arg("-a")
                .arg(&src_path)
                .arg(&dst_path)
                .output() {
                Ok(output) if !output.status.success() => {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    eprintln!("Copy failed for {}: {}", src_path.display(), stderr.trim());
                }
                Err(e) => {
                    eprintln!("Copy command failed for {}: {}", src_path.display(), e);
                }
                _ => {} // Success, do nothing
            }
        }
    }

    Ok(())
}

/// Result of a file copy operation between worktrees.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyResult {
    /// Files that were successfully copied
    pub copied: Vec<String>,
    /// Files that failed to copy
    pub failed: Vec<CopyFailure>,
    /// Whether CoW (copy-on-write) was used
    pub cow_used: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyFailure {
    pub path: String,
    pub reason: String,
}

/// Copy specific files from one worktree to another.
///
/// Uses CoW (copy-on-write) via `cp -c` on APFS/macOS for efficient copying.
/// Falls back to regular copy on other filesystems.
///
/// # Arguments
/// * `source_wt` - Path to the source worktree
/// * `dest_wt` - Path to the destination worktree
/// * `patterns` - List of file paths or glob patterns to copy
#[instrument(level = "info")]
pub fn copy_shared_files(
    source_wt: &str,
    dest_wt: &str,
    patterns: &[String],
) -> Result<CopyResult, WorktreeError> {
    let source = Path::new(source_wt);
    let dest = Path::new(dest_wt);

    if !source.exists() {
        return Err(WorktreeError::PathValidation {
            message: format!("Source worktree does not exist: {}", source_wt),
        });
    }
    if !dest.exists() {
        return Err(WorktreeError::PathValidation {
            message: format!("Destination worktree does not exist: {}", dest_wt),
        });
    }

    let cow_available = check_cow_support(source);
    let mut copied = Vec::new();
    let mut failed = Vec::new();

    for pattern in patterns {
        // Resolve files matching the pattern
        let files = resolve_pattern(source, pattern);

        for file in &files {
            let src_path = source.join(file);
            let dst_path = dest.join(file);

            // Create parent directories
            if let Some(parent) = dst_path.parent() {
                if let Err(e) = fs::create_dir_all(parent) {
                    failed.push(CopyFailure {
                        path: file.clone(),
                        reason: format!("Failed to create directory: {}", e),
                    });
                    continue;
                }
            }

            // Try CoW copy first, fall back to regular copy
            let copy_result = if cow_available {
                cow_copy(&src_path, &dst_path)
                    .or_else(|_| regular_copy(&src_path, &dst_path))
            } else {
                regular_copy(&src_path, &dst_path)
            };

            match copy_result {
                Ok(()) => copied.push(file.clone()),
                Err(e) => failed.push(CopyFailure {
                    path: file.clone(),
                    reason: e.to_string(),
                }),
            }
        }

        // If no files matched and pattern looks like a direct file path
        if files.is_empty() && !pattern.contains('*') {
            let src_path = source.join(pattern);
            if src_path.exists() {
                let dst_path = dest.join(pattern);
                if let Some(parent) = dst_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                match if cow_available {
                    cow_copy(&src_path, &dst_path)
                        .or_else(|_| regular_copy(&src_path, &dst_path))
                } else {
                    regular_copy(&src_path, &dst_path)
                } {
                    Ok(()) => copied.push(pattern.clone()),
                    Err(e) => failed.push(CopyFailure {
                        path: pattern.clone(),
                        reason: e.to_string(),
                    }),
                }
            } else {
                failed.push(CopyFailure {
                    path: pattern.clone(),
                    reason: "File not found".to_string(),
                });
            }
        }
    }

    Ok(CopyResult {
        copied,
        failed,
        cow_used: cow_available,
    })
}

/// Check if the filesystem supports CoW (APFS on macOS).
fn check_cow_support(path: &Path) -> bool {
    // On macOS, APFS supports clone/CoW via `cp -c`
    if cfg!(target_os = "macos") {
        // Try a test clone to see if it works
        let test_src = path.join(".git/HEAD");
        if test_src.exists() {
            let test_dst = path.join(".git/.cow_test");
            let result = Command::new("cp")
                .arg("-c")
                .arg(&test_src)
                .arg(&test_dst)
                .output();
            // Clean up test file
            let _ = fs::remove_file(&test_dst);
            return result.map(|o| o.status.success()).unwrap_or(false);
        }
    }
    false
}

/// Copy a file using CoW (copy-on-write) via `cp -c`.
fn cow_copy(src: &Path, dst: &Path) -> Result<(), WorktreeError> {
    let output = Command::new("cp")
        .arg("-c")
        .arg(src)
        .arg(dst)
        .output()
        .map_err(|e| WorktreeError::Process {
            message: format!("CoW copy failed: {}", e),
        })?;

    if !output.status.success() {
        return Err(WorktreeError::Process {
            message: format!(
                "CoW copy failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ),
        });
    }

    Ok(())
}

/// Regular file copy fallback.
fn regular_copy(src: &Path, dst: &Path) -> Result<(), WorktreeError> {
    fs::copy(src, dst).map_err(|e| WorktreeError::Io {
        message: format!("Copy failed {} -> {}: {}", src.display(), dst.display(), e),
    })?;
    Ok(())
}

/// Resolve a glob pattern against a directory, returning relative paths.
fn resolve_pattern(base: &Path, pattern: &str) -> Vec<String> {
    let mut matches = Vec::new();

    if pattern.contains('*') {
        // Simple glob matching - walk directory and match
        if let Ok(entries) = walk_dir_recursive(base) {
            for entry in entries {
                if simple_glob_match(pattern, &entry) {
                    matches.push(entry);
                }
            }
        }
    }

    matches
}

/// Recursively walk a directory, returning relative paths.
fn walk_dir_recursive(base: &Path) -> Result<Vec<String>, std::io::Error> {
    let mut results = Vec::new();
    walk_dir_inner(base, base, &mut results)?;
    Ok(results)
}

fn walk_dir_inner(base: &Path, current: &Path, results: &mut Vec<String>) -> Result<(), std::io::Error> {
    if current.is_dir() {
        // Skip .git directory
        if current.file_name().map(|n| n == ".git").unwrap_or(false) {
            return Ok(());
        }
        for entry in fs::read_dir(current)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                walk_dir_inner(base, &path, results)?;
            } else if let Ok(relative) = path.strip_prefix(base) {
                results.push(relative.to_string_lossy().to_string());
            }
        }
    }
    Ok(())
}

/// Simple glob matching (supports * and **).
fn simple_glob_match(pattern: &str, path: &str) -> bool {
    let pattern_parts: Vec<&str> = pattern.split('/').collect();
    let path_parts: Vec<&str> = path.split('/').collect();

    glob_match_parts(&pattern_parts, &path_parts)
}

fn glob_match_parts(pattern: &[&str], path: &[&str]) -> bool {
    if pattern.is_empty() && path.is_empty() {
        return true;
    }
    if pattern.is_empty() {
        return false;
    }

    if pattern[0] == "**" {
        // ** matches zero or more directories
        if pattern.len() == 1 {
            return true;
        }
        for i in 0..=path.len() {
            if glob_match_parts(&pattern[1..], &path[i..]) {
                return true;
            }
        }
        return false;
    }

    if path.is_empty() {
        return false;
    }

    if glob_match_segment(pattern[0], path[0]) {
        glob_match_parts(&pattern[1..], &path[1..])
    } else {
        false
    }
}

fn glob_match_segment(pattern: &str, segment: &str) -> bool {
    if pattern == "*" {
        return true;
    }

    // Handle *.ext patterns
    if pattern.starts_with('*') {
        let suffix = &pattern[1..];
        return segment.ends_with(suffix);
    }

    // Handle prefix.* patterns
    if pattern.ends_with('*') {
        let prefix = &pattern[..pattern.len() - 1];
        return segment.starts_with(prefix);
    }

    pattern == segment
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_glob_match() {
        assert!(simple_glob_match("*.rs", "main.rs"));
        assert!(simple_glob_match("src/*.rs", "src/main.rs"));
        assert!(simple_glob_match("**/*.rs", "src/lib/main.rs"));
        assert!(!simple_glob_match("*.rs", "main.ts"));
        assert!(!simple_glob_match("src/*.rs", "lib/main.rs"));
    }

    #[test]
    fn test_glob_match_segment() {
        assert!(glob_match_segment("*", "anything"));
        assert!(glob_match_segment("*.rs", "main.rs"));
        assert!(glob_match_segment("test*", "test_file"));
        assert!(!glob_match_segment("*.rs", "main.ts"));
    }

    #[test]
    fn test_copy_result_serialization() {
        let result = CopyResult {
            copied: vec!["file1.rs".to_string()],
            failed: vec![CopyFailure {
                path: "file2.rs".to_string(),
                reason: "Not found".to_string(),
            }],
            cow_used: true,
        };
        let json = serde_json::to_string(&result).unwrap();
        let parsed: CopyResult = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.copied.len(), 1);
        assert!(parsed.cow_used);
    }

    #[test]
    fn test_copy_shared_files_missing_source() {
        let result = copy_shared_files(
            "/nonexistent/source",
            "/nonexistent/dest",
            &["*.rs".to_string()],
        );
        assert!(result.is_err());
    }
}
