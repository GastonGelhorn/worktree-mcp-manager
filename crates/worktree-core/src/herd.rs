use crate::WorktreeError;
use crate::git::run_external;
use std::path::Path;

pub fn link(path: &str, project_name: &str) -> Result<(), WorktreeError> {
    run_external("herd", Path::new(path), &["link", project_name])
        .map_err(|e| WorktreeError::Herd { message: e.to_string() })?;
    Ok(())
}

pub fn unlink(path: &str, project_name: &str) -> Result<(), WorktreeError> {
    run_external("herd", Path::new(path), &["unlink", project_name])
        .map_err(|e| WorktreeError::Herd { message: e.to_string() })?;
    Ok(())
}
