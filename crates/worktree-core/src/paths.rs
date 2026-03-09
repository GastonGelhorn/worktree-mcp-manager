use crate::WorktreeError;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// RepoPath — validated, canonical path to a git repository root
// ---------------------------------------------------------------------------

/// A validated path to a git repository root directory.
///
/// Constructing a `RepoPath` guarantees the directory exists. The inner value
/// is kept as-is (not necessarily canonical) so callers can preserve the
/// user-supplied representation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoPath(PathBuf);

impl RepoPath {
    /// Create from a raw string, validating the directory exists.
    pub fn new(s: &str) -> Result<Self, WorktreeError> {
        let p = Path::new(s);
        if !p.exists() {
            return Err(WorktreeError::PathValidation {
                message: format!("Repository path does not exist: {}", s),
            });
        }
        Ok(Self(p.to_path_buf()))
    }

    /// Wrap a path without validation (for internal use where the path is known-good).
    #[allow(dead_code)]
    pub(crate) fn from_trusted(p: PathBuf) -> Self {
        Self(p)
    }

    pub fn as_path(&self) -> &Path {
        &self.0
    }

    pub fn as_str(&self) -> &str {
        self.0.to_str().unwrap_or("")
    }
}

impl AsRef<Path> for RepoPath {
    fn as_ref(&self) -> &Path {
        &self.0
    }
}

impl fmt::Display for RepoPath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0.display())
    }
}

// ---------------------------------------------------------------------------
// WorktreePath — validated path to a worktree directory
// ---------------------------------------------------------------------------

/// A validated path to a git worktree directory.
///
/// Distinct from `RepoPath` at the type level so the compiler prevents
/// accidentally passing one where the other is expected.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreePath(PathBuf);

impl WorktreePath {
    /// Create from a raw string, validating the directory exists.
    pub fn new(s: &str) -> Result<Self, WorktreeError> {
        let p = Path::new(s);
        if !p.exists() {
            return Err(WorktreeError::PathValidation {
                message: format!("Worktree path does not exist: {}", s),
            });
        }
        Ok(Self(p.to_path_buf()))
    }

    /// Wrap a path without validation (for internal use).
    #[allow(dead_code)]
    pub(crate) fn from_trusted(p: PathBuf) -> Self {
        Self(p)
    }

    pub fn as_path(&self) -> &Path {
        &self.0
    }

    pub fn as_str(&self) -> &str {
        self.0.to_str().unwrap_or("")
    }

    /// Resolve to a canonical path for operations that need it.
    pub fn canonical(&self) -> Result<PathBuf, WorktreeError> {
        std::fs::canonicalize(&self.0).map_err(|e| WorktreeError::PathValidation {
            message: format!("Cannot canonicalize worktree path: {}", e),
        })
    }
}

impl AsRef<Path> for WorktreePath {
    fn as_ref(&self) -> &Path {
        &self.0
    }
}

impl fmt::Display for WorktreePath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0.display())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repo_path_rejects_nonexistent() {
        let result = RepoPath::new("/nonexistent_xyz_12345");
        assert!(result.is_err());
    }

    #[test]
    fn worktree_path_rejects_nonexistent() {
        let result = WorktreePath::new("/nonexistent_xyz_12345");
        assert!(result.is_err());
    }

    #[test]
    fn repo_path_accepts_tmp() {
        let result = RepoPath::new("/tmp");
        assert!(result.is_ok());
    }

    #[test]
    fn worktree_path_as_str() {
        let wt = WorktreePath::from_trusted(PathBuf::from("/tmp/test"));
        assert_eq!(wt.as_str(), "/tmp/test");
    }

    #[test]
    fn repo_path_display() {
        let rp = RepoPath::from_trusted(PathBuf::from("/tmp/repo"));
        assert_eq!(format!("{}", rp), "/tmp/repo");
    }
}
