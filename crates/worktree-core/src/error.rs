use thiserror::Error;

#[derive(Error, Debug)]
pub enum WorktreeError {
    #[error("Git error: {message}")]
    Git { message: String },

    #[error("Herd error: {message}")]
    Herd { message: String },

    #[error("Process error: {message}")]
    Process { message: String },

    #[error("Framework error: {message}")]
    Framework { message: String },

    #[error("IO error: {message}")]
    Io { message: String },

    #[error("Path validation error: {message}")]
    PathValidation { message: String },

    #[error("{message}")]
    Other { message: String },
}

impl From<std::io::Error> for WorktreeError {
    fn from(e: std::io::Error) -> Self {
        WorktreeError::Io {
            message: e.to_string(),
        }
    }
}
