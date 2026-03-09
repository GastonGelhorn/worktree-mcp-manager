/**
 * Merge and integration tools
 */

import type { ToolDefinition, ToolHandler, ToolModule, ToolResponse } from "./types.js";
import { execFile } from "child_process";
import { CLI_BIN } from "../utils.js";

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
    name: "merge_worktree",
    description:
      "[WARNING: COMPLEX STATE CHANGE] Merge a feature branch into target branch with configurable strategy. Options: merge (standard merge), squash (single commit), rebase (replay commits), fast-forward (linear history only). Optionally cleanup worktree and delete branch. Verify readiness before calling.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string", description: "Path to the main git repository" },
        branch: { type: "string", description: "The feature branch to merge" },
        targetBranch: { type: "string", description: "The branch to merge into (usually 'main' or 'master')" },
        strategy: {
          type: "string",
          description: "Merge strategy: 'merge' (default), 'squash', 'rebase', or 'fast-forward'",
        },
        dryRun: { type: "boolean", description: "Preview the merge without executing it" },
        generateCommitMessage: { type: "boolean", description: "Auto-generate semantic commit message (for squash)" },
        autoCleanup: {
          type: "boolean",
          description: "Automatically delete branch and remove worktree if merge succeeds",
        },
      },
      required: ["repoPath", "branch", "targetBranch"],
    },
  },
  {
    name: "merge_dry_run",
    description: "Preview a merge operation without executing it. Shows what would change and potential conflicts.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
        branch: { type: "string" },
        targetBranch: { type: "string" },
        strategy: { type: "string", description: "'merge', 'squash', 'rebase', or 'fast-forward'" },
      },
      required: ["repoPath", "branch", "targetBranch"],
    },
  },
  {
    name: "check_branch_integration",
    description: "Check integration status of a branch at 5 levels: local, staging, development, staging-prod, production. Returns boolean for each.",
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
    name: "predict_conflicts",
    description: "Predict potential merge conflicts before attempting merge. Analyzes file overlaps and conflicting changes.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
        branch: { type: "string" },
        targetBranch: { type: "string" },
      },
      required: ["repoPath", "branch", "targetBranch"],
    },
  },
  {
    name: "merge_and_cleanup",
    description:
      "[WARNING: COMPLEX STATE CHANGE] Merges a feature branch, deletes its worktree, and deletes the branch. This is a permanent integration step. ONLY call this when the user explicitly requests a cleanup or merge. Confirm readiness if unsure.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string", description: "Path to the main git repository" },
        wtPath: { type: "string", description: "Path to the worktree to remove" },
        branch: { type: "string", description: "The feature branch to merge and delete" },
        targetBranch: { type: "string", description: "The branch to merge into (usually 'main' or 'master')" },
      },
      required: ["repoPath", "wtPath", "branch", "targetBranch"],
    },
  },
];

const handlers: Record<string, ToolHandler> = {
  merge_worktree: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, branch, targetBranch, strategy = "merge", dryRun = false, generateCommitMessage, autoCleanup } = args as {
      repoPath: string;
      branch: string;
      targetBranch: string;
      strategy?: string;
      dryRun?: boolean;
      generateCommitMessage?: boolean;
      autoCleanup?: boolean;
    };

    try {
      const cliArgs = ["merge-worktree", repoPath, branch, targetBranch];
      if (strategy) cliArgs.push("--strategy", strategy);
      if (dryRun) cliArgs.push("--dry-run");
      if (generateCommitMessage) cliArgs.push("--generate-commit-message");
      if (autoCleanup) cliArgs.push("--auto-cleanup");

      const result = await runCli(cliArgs);
      const resultStr = typeof result === "object" ? JSON.stringify(result) : String(result);
      return { content: [{ type: "text", text: resultStr }] };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Merge failed: ${errorMsg}` }], isError: true };
    }
  },

  merge_dry_run: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, branch, targetBranch, strategy = "merge" } = args as {
      repoPath: string;
      branch: string;
      targetBranch: string;
      strategy?: string;
    };

    try {
      const cliArgs = ["merge-dry-run", repoPath, branch, targetBranch];
      if (strategy) cliArgs.push("--strategy", strategy);

      const result = await runCli(cliArgs);
      const resultStr = typeof result === "object" ? JSON.stringify(result) : String(result);
      return { content: [{ type: "text", text: resultStr }] };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Dry run failed: ${errorMsg}` }], isError: true };
    }
  },

  check_branch_integration: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, branch } = args as { repoPath: string; branch: string };

    try {
      const result = await runCli(["check-branch-integration", repoPath, branch]);
      const resultStr = typeof result === "object" ? JSON.stringify(result) : String(result);
      return { content: [{ type: "text", text: resultStr }] };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Integration check failed: ${errorMsg}` }], isError: true };
    }
  },

  predict_conflicts: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, branch, targetBranch } = args as { repoPath: string; branch: string; targetBranch: string };

    try {
      const result = await runCli(["predict-conflicts", repoPath, branch, targetBranch]);
      const resultStr = typeof result === "object" ? JSON.stringify(result) : String(result);
      return { content: [{ type: "text", text: resultStr }] };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Conflict prediction failed: ${errorMsg}` }], isError: true };
    }
  },

  merge_and_cleanup: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, wtPath, branch, targetBranch } = args as {
      repoPath: string;
      wtPath: string;
      branch: string;
      targetBranch: string;
    };

    try {
      await runCli(["merge-and-cleanup", repoPath, wtPath, targetBranch, branch]);
      return {
        content: [
          {
            type: "text",
            text: `Successfully merged ${branch} into ${targetBranch}, removed the worktree at ${wtPath}, and deleted branch ${branch}.`,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Merge and cleanup failed: ${errorMsg}` }], isError: true };
    }
  },
};

export const mergeTools: ToolModule = {
  definitions,
  handlers,
};
