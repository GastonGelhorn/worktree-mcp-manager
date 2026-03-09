use serde::{Deserialize, Serialize};

/// Non-fatal issue encountered during a multi-step operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Warning {
    /// Which stage produced this warning (e.g. "copy_configs", "herd_link").
    pub stage: String,
    /// Human-readable description.
    pub message: String,
}

/// Result of a multi-step operation that can partially succeed.
///
/// The operation completed its primary goal (value is present), but
/// some optional side-effects may have failed. Consumers should inspect
/// `warnings` and surface them to the user.
#[derive(Debug, Serialize, Deserialize)]
pub struct OpResult<T> {
    pub value: T,
    pub warnings: Vec<Warning>,
}

impl<T> OpResult<T> {
    pub fn ok(value: T) -> Self {
        Self { value, warnings: Vec::new() }
    }

    pub fn with_warnings(value: T, warnings: Vec<Warning>) -> Self {
        Self { value, warnings }
    }

    pub fn has_warnings(&self) -> bool {
        !self.warnings.is_empty()
    }
}

impl Warning {
    pub fn new(stage: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            stage: stage.into(),
            message: message.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn op_result_ok_has_no_warnings() {
        let result = OpResult::ok(42);
        assert!(!result.has_warnings());
        assert_eq!(result.value, 42);
    }

    #[test]
    fn op_result_with_warnings() {
        let result = OpResult::with_warnings(
            (),
            vec![Warning::new("copy_configs", "skipped: not found")],
        );
        assert!(result.has_warnings());
        assert_eq!(result.warnings.len(), 1);
        assert_eq!(result.warnings[0].stage, "copy_configs");
    }
}
