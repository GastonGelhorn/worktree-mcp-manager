/**
 * Utility and context management tools
 */

import type { ToolDefinition, ToolHandler, ToolModule, ToolResponse } from "./types.js";
import { execFile } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import os from "os";
import { CLI_BIN } from "../utils.js";
import { openInCursor } from "./ide-utils.js";

function runCli(args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    execFile(CLI_BIN, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        try {
          const parsed = JSON.parse(stderr);
          reject(new Error(parsed.error || stderr));
        } catch {
          reject(new Error(stderr || err.message));
        }
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve(stdout.trim());
      }
    });
  });
}

const definitions: ToolDefinition[] = [
  {
    name: "list_branches",
    description: "List all branches in a repository",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
      },
      required: ["repoPath"],
    },
  },
  {
    name: "check_framework",
    description: "Check if a directory contains a specific framework (e.g. Laravel)",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
  },
  {
    name: "get_last_commit",
    description: "Get the last commit info for a worktree",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string" },
      },
      required: ["wtPath"],
    },
  },
  {
    name: "get_ahead_behind",
    description: "Get ahead/behind commit counts for a branch relative to origin",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string" },
        branch: { type: "string" },
      },
      required: ["wtPath", "branch"],
    },
  },
  {
    name: "has_uncommitted_changes",
    description: "Check if a repository has uncommitted changes",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
      },
      required: ["repoPath"],
    },
  },
  {
    name: "get_current_branch",
    description: "Get the current active branch of a repository",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
      },
      required: ["repoPath"],
    },
  },
  {
    name: "get_branch_graph",
    description: "Get the commit graph for a repository",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
        maxCommits: { type: "number" },
      },
      required: ["repoPath", "maxCommits"],
    },
  },
  {
    name: "scan_repos",
    description: "Scan a directory to find all git repositories within it",
    inputSchema: {
      type: "object",
      properties: {
        dirPath: { type: "string" },
      },
      required: ["dirPath"],
    },
  },
  {
    name: "get_repo_fingerprint",
    description: "Get a unique fingerprint for the current state of a git repository",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
      },
      required: ["repoPath"],
    },
  },
  {
    name: "generate_pr_url",
    description: "Generate a PR URL for the given branch",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
        branch: { type: "string" },
      },
      required: ["repoPath", "branch"],
    },
  },
  {
    name: "inject_prompt",
    description: "Inject an AI prompt context into a .cursorrules file in the target directory",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string" },
        branch: { type: "string" },
        context: { type: "string" },
      },
      required: ["wtPath", "branch", "context"],
    },
  },
  {
    name: "inject_claude_context",
    description:
      "Generate a CLAUDE.md file in the worktree with rich context: diff stats vs main, changed files list, uncommitted changes, and task description. Ideal for setting up AI agent context in a new worktree.",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string", description: "Absolute path to the worktree" },
        branch: { type: "string", description: "Branch name of the worktree" },
        context: {
          type: "string",
          description: "Optional task description or context for the AI agent",
        },
      },
      required: ["wtPath", "branch"],
    },
  },
  {
    name: "get_commit_template",
    description: "Read the user's preferred commit message template. You must call this before crafting and executing a git commit.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_ci_status",
    description: "Get CI/CD status for a branch in a repository. Returns the current build/deployment state and any related metadata.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string", description: "Path to the git repository" },
        branch: { type: "string", description: "Branch name to check CI status for" },
      },
      required: ["repoPath", "branch"],
    },
  },
  {
    name: "detect_ci_provider",
    description: "Detect which CI provider a repository uses (GitHub Actions, GitLab CI, CircleCI, etc.). Returns provider name and configuration details.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string", description: "Path to the git repository" },
      },
      required: ["repoPath"],
    },
  },
  {
    name: "analyze_diff",
    description: "Perform semantic diff analysis between branches with risk scoring. Helps understand the impact and safety of changes.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string", description: "Path to the git repository" },
        branch: { type: "string", description: "Branch to analyze changes for" },
      },
      required: ["repoPath", "branch"],
    },
  },
  {
    name: "suggest_worktree",
    description: "Suggest the best worktree configuration for a given task based on repository analysis and project metadata.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string", description: "Path to the git repository" },
        task: { type: "string", description: "Description of the task to perform" },
      },
      required: ["repoPath", "task"],
    },
  },
  {
    name: "inject_context_v2",
    description: "Enhanced context injection with configurable depth and target IDE. Supports different detail levels and multiple IDE targets.",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string", description: "Path to the worktree" },
        branch: { type: "string", description: "Branch name" },
        depth: { type: "string", description: "Context detail level: 'minimal', 'standard', or 'deep'" },
        target: { type: "string", description: "Target IDE/tool: 'claude', 'cursor', 'antigravity', or 'all'" },
      },
      required: ["wtPath", "branch"],
    },
  },
  {
    name: "save_commit_template",
    description: "Save an LLM commit template for future use in git commits. This template will be used as the default when committing.",
    inputSchema: {
      type: "object",
      properties: {
        template: { type: "string", description: "The commit message template to save" },
      },
      required: ["template"],
    },
  },
  {
    name: "copy_shared_files",
    description: "Copy files between worktrees using glob patterns. Useful for sharing configuration or generated files across worktrees.",
    inputSchema: {
      type: "object",
      properties: {
        sourceWtPath: { type: "string", description: "Path to the source worktree" },
        destWtPath: { type: "string", description: "Path to the destination worktree" },
        patterns: { type: "string", description: "Comma-separated glob patterns (e.g., '*.json,src/**/*.ts')" },
      },
      required: ["sourceWtPath", "destWtPath", "patterns"],
    },
  },
  {
    name: "open_in_cursor",
    description: "Open a path in Cursor IDE",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to open in Cursor" },
      },
      required: ["path"],
    },
  },
  {
    name: "setup_all_ides",
    description: "Setup MCP configuration in all detected IDEs (Cursor, VS Code, Claude Desktop) for a repository.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string", description: "Path to the git repository" },
      },
      required: ["repoPath"],
    },
  },
];

const handlers: Record<string, ToolHandler> = {
  list_branches: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath } = args as { repoPath: string };
    const result = await runCli(["list-branches", repoPath]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  check_framework: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { path: wtPath } = args as { path: string };
    const result = await runCli(["check-framework", wtPath]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  get_last_commit: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath } = args as { wtPath: string };
    const result = await runCli(["get-last-commit", wtPath]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  get_ahead_behind: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath, branch } = args as { wtPath: string; branch: string };
    const result = await runCli(["get-ahead-behind", wtPath, branch]);
    return {
      content: [
        {
          type: "text",
          text: `${(result as { behind?: number }).behind}\t${(result as { ahead?: number }).ahead}`,
        },
      ],
    };
  },

  has_uncommitted_changes: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath } = args as { repoPath: string };
    const result = await runCli(["has-uncommitted-changes", repoPath]);
    return { content: [{ type: "text", text: (result as { has_changes?: boolean }).has_changes ? "true" : "false" }] };
  },

  get_current_branch: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath } = args as { repoPath: string };
    const result = await runCli(["get-current-branch", repoPath]);
    return { content: [{ type: "text", text: (result as { branch?: string }).branch || "" }] };
  },

  get_branch_graph: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, maxCommits } = args as { repoPath: string; maxCommits: number };
    const result = await runCli(["get-branch-graph", repoPath, "--max-commits", String(Math.min(Math.floor(maxCommits), 200))]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  scan_repos: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { dirPath } = args as { dirPath: string };
    const result = await runCli(["scan-repos", dirPath]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  get_repo_fingerprint: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath } = args as { repoPath: string };
    const result = await runCli(["get-repo-fingerprint", repoPath]);
    return { content: [{ type: "text", text: (result as { fingerprint?: string }).fingerprint || "" }] };
  },

  generate_pr_url: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, branch } = args as { repoPath: string; branch: string };
    const result = await runCli(["generate-pr-url", repoPath, branch]);
    return { content: [{ type: "text", text: (result as { url?: string }).url || "" }] };
  },

  inject_prompt: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath, branch, context } = args as { wtPath: string; branch: string; context: string };
    await runCli(["inject-prompt", wtPath, branch, context]);
    return { content: [{ type: "text", text: `Prompt injected successfully into ${wtPath}/.cursorrules` }] };
  },

  inject_claude_context: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath, branch, context } = args as { wtPath: string; branch: string; context?: string };
    const cliArgs = ["inject-claude-context", wtPath, branch];
    if (context) {
      cliArgs.push("--context", context);
    }
    const result = await runCli(cliArgs);
    return { content: [{ type: "text", text: `CLAUDE.md generated at ${(result as { path?: string }).path || wtPath + "/CLAUDE.md"}` }] };
  },

  get_commit_template: async (): Promise<ToolResponse> => {
    try {
      const templatePath = path.join(os.homedir(), ".worktree", "commit_template.txt");
      if (existsSync(templatePath)) {
        const content = readFileSync(templatePath, "utf-8");
        if (content.trim()) {
          return { content: [{ type: "text", text: content }] };
        }
      }
    } catch (err) {
      console.error("Failed to read commit template:", err);
    }
    return {
      content: [{ type: "text", text: "Write a concise commit message in Conventional Commits format. Output ONLY the commit message." }],
    };
  },

  get_ci_status: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, branch } = args as { repoPath: string; branch: string };
    const result = await runCli(["get-ci-status", "--repo-path", repoPath, "--branch", branch]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  detect_ci_provider: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath } = args as { repoPath: string };
    const result = await runCli(["detect-ci-provider", "--repo-path", repoPath]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  analyze_diff: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, branch } = args as { repoPath: string; branch: string };
    const result = await runCli(["analyze-diff", "--repo-path", repoPath, "--branch", branch]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  suggest_worktree: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, task } = args as { repoPath: string; task: string };
    const result = await runCli(["suggest-worktree", "--repo-path", repoPath, "--task", task]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  inject_context_v2: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath, branch, depth = "standard", target = "all" } = args as { wtPath: string; branch: string; depth?: string; target?: string };
    const result = await runCli(["inject-context-v2", "--wt-path", wtPath, "--branch", branch, "--depth", depth, "--target", target]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  save_commit_template: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { template } = args as { template: string };
    try {
      const workTreeDir = path.join(os.homedir(), ".worktree");
      if (!existsSync(workTreeDir)) {
        mkdirSync(workTreeDir, { recursive: true });
      }
      const templatePath = path.join(workTreeDir, "commit_template.txt");
      writeFileSync(templatePath, template, "utf-8");
      return { content: [{ type: "text", text: `Commit template saved to ${templatePath}` }] };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Failed to save commit template: ${errorMsg}` }], isError: true };
    }
  },

  copy_shared_files: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { sourceWtPath, destWtPath, patterns } = args as { sourceWtPath: string; destWtPath: string; patterns: string };
    const result = await runCli(["copy-shared-files", "--source", sourceWtPath, "--dest", destWtPath, "--patterns", patterns]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  open_in_cursor: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { path: dirPath } = args as { path: string };
    try {
      await openInCursor(dirPath);
      return { content: [{ type: "text", text: `Opened ${dirPath} in Cursor` }] };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Failed to open in Cursor: ${errorMsg}` }],
        isError: true,
      };
    }
  },

  setup_all_ides: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath } = args as { repoPath: string };
    const result = await runCli(["setup-all-ides", "--repo-path", repoPath]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

export const utilityTools: ToolModule = {
  definitions,
  handlers,
};
