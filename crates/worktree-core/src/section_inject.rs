/// Upsert a marked section in a markdown-like document.
///
/// Finds a section starting with `marker` (e.g. `"## Worktree context (auto)"`)
/// and replaces everything until the next heading at the same level. If the
/// section doesn't exist, it is appended.
///
/// `heading_prefix` controls what counts as a new section start (e.g. `"## "` or `"# "`).
pub fn upsert_section(existing: &str, marker: &str, new_content: &str, heading_prefix: &str) -> String {
    let lines: Vec<&str> = existing.lines().collect();

    let start = lines.iter().position(|l| l.trim().starts_with(marker));

    match start {
        Some(s) => {
            // Find the next heading at the same or higher level
            let next_heading = lines[(s + 1)..]
                .iter()
                .position(|l| l.starts_with(heading_prefix) && !l.trim().starts_with(marker));
            let end = next_heading
                .map(|p| s + 1 + p)
                .unwrap_or(lines.len());

            let before: String = lines[..s].join("\n");
            let after: String = lines[end..].join("\n");

            let mut out = String::new();
            if !before.is_empty() {
                out.push_str(before.trim_end());
                out.push_str("\n\n");
            }
            out.push_str(new_content.trim_end());
            if !after.is_empty() {
                out.push_str("\n\n");
                out.push_str(after.trim_start());
            }
            out
        }
        None => {
            let trimmed = existing.trim_end();
            if trimmed.is_empty() {
                new_content.to_string()
            } else {
                format!("{}\n\n{}", trimmed, new_content.trim_start())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appends_when_no_existing_section() {
        let existing = "# My Project\n\nSome intro text.";
        let new = "## Auto Section\n\nGenerated content here.";
        let result = upsert_section(existing, "## Auto Section", new, "## ");
        assert!(result.starts_with("# My Project"));
        assert!(result.contains("Generated content here."));
    }

    #[test]
    fn replaces_existing_section() {
        let existing = "# Top\n\n## Auto Section\n\nOld content.\n\n## Other\n\nKept.";
        let new = "## Auto Section\n\nNew content.";
        let result = upsert_section(existing, "## Auto Section", new, "## ");
        assert!(result.contains("New content."));
        assert!(!result.contains("Old content."));
        assert!(result.contains("Kept."));
    }

    #[test]
    fn replaces_section_at_end() {
        let existing = "# Top\n\n## Auto Section\n\nOld stuff.";
        let new = "## Auto Section\n\nReplaced.";
        let result = upsert_section(existing, "## Auto Section", new, "## ");
        assert!(result.contains("Replaced."));
        assert!(!result.contains("Old stuff."));
        assert!(result.contains("# Top"));
    }

    #[test]
    fn handles_empty_existing() {
        let new = "## Auto\n\nContent.";
        let result = upsert_section("", "## Auto", new, "## ");
        assert_eq!(result, new);
    }

    #[test]
    fn preserves_content_before_and_after() {
        let existing = "# Title\n\nIntro.\n\n## Auto\n\nOld.\n\n## Footer\n\nEnd.";
        let new = "## Auto\n\nFresh.";
        let result = upsert_section(existing, "## Auto", new, "## ");
        assert!(result.contains("Intro."));
        assert!(result.contains("Fresh."));
        assert!(result.contains("End."));
        assert!(!result.contains("Old."));
    }

    #[test]
    fn works_with_h1_prefix() {
        let existing = "# Title\n\n# Auto Section\n\nOld.\n\n# Next\n\nKept.";
        let new = "# Auto Section\n\nNew.";
        let result = upsert_section(existing, "# Auto Section", new, "# ");
        assert!(result.contains("New."));
        assert!(!result.contains("Old."));
        assert!(result.contains("Kept."));
    }
}
