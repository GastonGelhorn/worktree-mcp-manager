import re

with open("main.rs", "r") as f:
    content = f.read()

# Introduce a helper closure to allow `?`
content = content.replace(
    "let result: Result<serde_json::Value, String> = match cli.command {",
    "let result: Result<serde_json::Value, String> = (|| -> Result<serde_json::Value, String> {\n" +
    "        let parse_repo = |p: &str| worktree_core::paths::RepoPath::from_str(p).map_err(|e| e.to_string());\n" +
    "        let parse_wt = |p: &str| worktree_core::paths::WorktreePath::from_str(p).map_err(|e| e.to_string());\n" +
    "        let parse_path = |p: &str| std::path::Path::new(p);\n" +
    "        match cli.command {"
)

content = content.replace("};", "})();", 1)

# Now, replace git::list_worktrees(&repo_path) with git::list_worktrees(&parse_repo(&repo_path)?)
# We need to map argument types correctly based on the function being called.
# All functions returning errors on mismatched types:
replacements = [
    ("git::list_worktrees(&repo_path)", "git::list_worktrees(&parse_repo(&repo_path)?)"),
    ("ops::add_worktree_full(\n            &repo_path,\n            &path,", "ops::add_worktree_full(\n            &parse_repo(&repo_path)?,\n            &parse_wt(&path)?,"),
    ("ops::remove_worktree_full(&repo_path, &path, force)", "ops::remove_worktree_full(&parse_repo(&repo_path)?, &parse_wt(&path)?, force)"),
    ("git::list_branches(&repo_path)", "git::list_branches(&parse_repo(&repo_path)?)"),
    ("git::get_last_commit(&wt_path)", "git::get_last_commit(&parse_wt(&wt_path)?)"),
    ("git::get_ahead_behind(&wt_path, &branch)", "git::get_ahead_behind(&parse_wt(&wt_path)?, &branch)"),
    ("git::get_branch_graph(&repo_path, max_commits)", "git::get_branch_graph(&parse_repo(&repo_path)?, max_commits)"),
    ("git::git_checkout(&repo_path, &branch)", "git::git_checkout(parse_path(&repo_path), &branch)"),
    ("git::git_stash(&repo_path, &message)", "git::git_stash(parse_path(&repo_path), &message)"),
    ("git::has_uncommitted_changes(&repo_path)", "git::has_uncommitted_changes(parse_path(&repo_path))"),
    ("git::get_current_branch(&repo_path)", "git::get_current_branch(parse_path(&repo_path))"),
    ("git::list_stashes(&repo_path)", "git::list_stashes(parse_path(&repo_path))"),
    ("git::git_stash_pop(&repo_path, index)", "git::git_stash_pop(parse_path(&repo_path), index)"),
    ("git::git_stash_drop(&repo_path, index)", "git::git_stash_drop(parse_path(&repo_path), index)"),
    ("git::delete_branch(&repo_path, &branch, force)", "git::delete_branch(&parse_repo(&repo_path)?, &branch, force)"),
    ("ops::merge_and_cleanup_full(&repo_path, &wt_path, &target_branch, &branch)", "ops::merge_and_cleanup_full(&parse_repo(&repo_path)?, &parse_wt(&wt_path)?, &target_branch, &branch)"),
    ("git::get_repo_fingerprint(&repo_path)", "git::get_repo_fingerprint(&parse_repo(&repo_path)?)"),
]

for old, new in replacements:
    content = content.replace(old, new)

with open("main.rs", "w") as f:
    f.write(content)

