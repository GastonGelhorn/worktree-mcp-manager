/**
 * Workflow and composite tools
 */

import type { ToolDefinition, ToolHandler, ToolModule, ToolResponse } from "./types.js";
import { execFile, spawn } from "child_process";
import { resolveSafeDir, CLI_BIN } from "../utils.js";
import { openInCursor, openInClaudeDesktop, openClaudeCLI } from "./ide-utils.js";

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
    name: "handoff_worktree",
    description: "Composite tool: creates a worktree, injects CLAUDE.md context, and opens the IDE — all in one call. Perfect for AI agents starting work on a new branch.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string", description: "Path to the main git repository" },
        path: { type: "string", description: "Path where the new worktree will be created" },
        branch: { type: "string", description: "Branch name for the worktree" },
        createBranch: { type: "boolean", description: "Whether to create the branch if it doesn't exist" },
        context: {
          type: "string",
          description: "Task description for CLAUDE.md context",
        },
        linkHerd: {
          type: "boolean",
          description: "Link to Laravel Herd (optional)",
        },
        postCreateCommand: {
          type: "string",
          description: "Optional command to run inside the newly created worktree. [WARNING: EXECUTION] Ensure the command is safe to run autonomously.",
        },
        ide: {
          type: "string",
          description: "IDE to open: 'cursor', 'claude-desktop', 'claude-cli'. Auto-detected if omitted.",
        },
      },
      required: ["repoPath", "path", "branch", "createBranch"],
    },
  },
  {
    name: "list_workflows",
    description: "List all available workflows (built-in + custom) for a repository. Returns metadata for each workflow.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string", description: "Path to the git repository" },
      },
      required: ["repoPath"],
    },
  },
  {
    name: "run_workflow",
    description: "[WARNING: EXECUTION] Execute a workflow by name on a worktree. Workflows can modify files and run commands. Ensure you understand what the workflow does before executing.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string", description: "Path to the main git repository" },
        workflowName: { type: "string", description: "Name of the workflow to execute" },
        wtPath: { type: "string", description: "Path to the worktree where the workflow will run" },
      },
      required: ["repoPath", "workflowName", "wtPath"],
    },
  },
  {
    name: "list_hooks",
    description: "List all discovered hooks (pre-commit, post-commit, pre-push, etc.) for a repository.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string", description: "Path to the git repository" },
      },
      required: ["repoPath"],
    },
  },
  {
    name: "run_hook",
    description: "[WARNING: EXECUTION] Execute a hook manually. Hooks can perform validation, formatting, or other automated tasks.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string", description: "Path to the main git repository" },
        hookType: { type: "string", description: "Hook type to execute (e.g., 'pre-commit', 'post-commit', 'pre-push')" },
        wtPath: { type: "string", description: "Path to the worktree where the hook will run" },
      },
      required: ["repoPath", "hookType", "wtPath"],
    },
  },
];

const handlers: Record<string, ToolHandler> = {
  handoff_worktree: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, path: wtPath, branch, createBranch, context, linkHerd, ide, postCreateCommand } = args as {
      repoPath: string;
      path: string;
      branch: string;
      createBranch: boolean;
      context?: string;
      linkHerd?: boolean;
      ide?: string;
      postCreateCommand?: string;
    };
    const steps: string[] = [];

    try {
      // 1. Create worktree
      const cliArgs = ["add-worktree", repoPath, wtPath, branch];
      if (createBranch) cliArgs.push("--create-branch");
      if (linkHerd) cliArgs.push("--link-herd");
      cliArgs.push("--copy-configs"); // Default to copying configs for handoffs
      await runCli(cliArgs);
      steps.push(`Created worktree at ${wtPath}`);

      // 1.b Post-Create Hook
      if (postCreateCommand) {
        const safeCwd = await resolveSafeDir(wtPath);
        const parts = postCreateCommand.trim().split(/\s+/);
        const bin = parts[0];
        const cmdArgs = parts.slice(1);
        if (bin) {
          spawn(bin, cmdArgs, { cwd: safeCwd, shell: false, detached: false, stdio: "ignore" });
          steps.push(`Started post-create command: ${postCreateCommand}`);
        }
      }

      // 2. Inject CLAUDE.md context
      const ctxArgs = ["inject-claude-context", wtPath, branch];
      if (context) {
        ctxArgs.push("--context", context);
      }
      await runCli(ctxArgs);
      steps.push("Generated CLAUDE.md with diff context");

      // 3. Open IDE
      const resolvedPath = await resolveSafeDir(wtPath);
      const target = ide || process.env.CLAUDE_CODE_ENTRYPOINT || "cursor";
      if (target === "claude-desktop") {
        await openInClaudeDesktop(resolvedPath);
        steps.push("Opened Claude Desktop");
      } else if (target === "cli" || target === "claude-cli") {
        await openClaudeCLI(resolvedPath);
        steps.push("Opened terminal with Claude CLI");
      } else {
        await openInCursor(resolvedPath);
        steps.push("Opened Cursor");
      }

      return { content: [{ type: "text", text: steps.join("\n") }] };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Handoff failed: ${errorMsg}\n\nCompleted steps:\n${steps.join("\n")}` }], isError: true };
    }
  },

  list_workflows: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath } = args as { repoPath: string };
    const result = await runCli(["list-workflows", repoPath]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  run_workflow: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, workflowName, wtPath } = args as { repoPath: string; workflowName: string; wtPath: string };
    const result = await runCli(["run-workflow", "--repo-path", repoPath, "--name", workflowName, "--working-dir", wtPath]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  list_hooks: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath } = args as { repoPath: string };
    const result = await runCli(["list-hooks", "--repo-path", repoPath]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  run_hook: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, hookType, wtPath } = args as { repoPath: string; hookType: string; wtPath: string };
    const result = await runCli(["run-hook", "--repo-path", repoPath, "--hook-type", hookType, "--working-dir", wtPath]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

export const workflowTools: ToolModule = {
  definitions,
  handlers,
};
