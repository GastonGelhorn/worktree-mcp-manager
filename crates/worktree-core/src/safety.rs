use crate::WorktreeError;
use std::path::Path;

pub fn resolve_safe_dir(raw_path: &str, under_home_only: bool) -> Result<String, WorktreeError> {
    let resolved = Path::new(raw_path)
        .canonicalize()
        .map_err(|e| WorktreeError::PathValidation {
            message: format!("Invalid path '{}': {}", raw_path, e),
        })?;

    if !resolved.is_dir() {
        return Err(WorktreeError::PathValidation {
            message: format!("Path is not a directory: {}", resolved.display()),
        });
    }

    if under_home_only {
        let home = std::env::var("HOME").map_err(|_| WorktreeError::PathValidation {
            message: "Could not determine HOME directory".into(),
        })?;
        let home_canonical =
            Path::new(&home)
                .canonicalize()
                .map_err(|e| WorktreeError::PathValidation {
                    message: format!("Invalid HOME path: {}", e),
                })?;
        if !resolved.starts_with(&home_canonical) {
            return Err(WorktreeError::PathValidation {
                message: format!(
                    "Path must be under home directory: {}",
                    resolved.display()
                ),
            });
        }
    }

    Ok(resolved.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_valid_home_dir() {
        let home = std::env::var("HOME").unwrap();
        let result = resolve_safe_dir(&home, true);
        assert!(result.is_ok());
    }

    #[test]
    fn rejects_nonexistent_path() {
        let result = resolve_safe_dir("/nonexistent_path_xyz_12345", true);
        assert!(result.is_err());
    }

    #[test]
    fn rejects_outside_home() {
        // /tmp on macOS resolves to /private/tmp, which is outside HOME
        let result = resolve_safe_dir("/tmp", true);
        assert!(result.is_err());
    }

    #[test]
    fn allows_outside_home_when_flag_false() {
        let result = resolve_safe_dir("/tmp", false);
        assert!(result.is_ok());
    }

    #[test]
    fn result_is_canonical() {
        let home = std::env::var("HOME").unwrap();
        let result = resolve_safe_dir(&home, false).unwrap();
        // Should not contain .. or other non-canonical components
        assert!(!result.contains(".."));
    }
}
