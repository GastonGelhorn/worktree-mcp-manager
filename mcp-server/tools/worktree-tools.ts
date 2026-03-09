/**
 * Worktree management tools
 */

import type { ToolDefinition, ToolHandler, ToolModule, ToolResponse } from "./types.js";
import { execFile, spawn } from "child_process";
import { resolveSafeDir, CLI_BIN } from "../utils.js";

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
    name: "list_worktrees",
    description: "List all git worktrees in a given repository",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
      },
      required: ["repoPath"],
    },
  },
  {
    name: "add_worktree",
    description: "Create a new git worktree and optionally link it to Laravel Herd",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
        path: { type: "string" },
        branch: { type: "string" },
        createBranch: { type: "boolean" },
        linkHerd: { type: "boolean" },
        copyConfigs: {
          type: "boolean",
          description: "Automatically copies caches like node_modules or target/ to speed up cold starts (defaults to true if omitted)",
        },
        cloneDb: {
          type: "boolean",
          description: "If a new DB is requested, copies the data from the base worktree's DB instead of migrating an empty one",
        },
        postCreateCommand: {
          type: "string",
          description: "Optional command to run inside the newly created worktree. [WARNING: EXECUTION] Ensure the command is safe to run autonomously.",
        },
      },
      required: ["repoPath", "path", "branch", "createBranch", "linkHerd"],
    },
  },
  {
    name: "remove_worktree",
    description: "[DANGER: DESTRUCTIVE] Remove an existing git worktree. This completely deletes the directory and all uncommitted files. You MUST explicitly ask the user for confirmation before calling this tool.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
        path: { type: "string" },
        force: { type: "boolean" },
      },
      required: ["repoPath", "path", "force"],
    },
  },
  {
    name: "get_worktree_state",
    description: "Get detailed state information for a specific worktree including branch, uncommitted changes, and ahead/behind counts",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string", description: "Absolute path to the worktree" },
      },
      required: ["wtPath"],
    },
  },
];

const handlers: Record<string, ToolHandler> = {
  list_worktrees: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath } = args as { repoPath: string };
    const result = await runCli(["list-worktrees", repoPath]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  add_worktree: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, path: wtPath, branch, createBranch, linkHerd, copyConfigs, cloneDb, postCreateCommand } = args as {
      repoPath: string;
      path: string;
      branch: string;
      createBranch: boolean;
      linkHerd: boolean;
      copyConfigs?: boolean;
      cloneDb?: boolean;
      postCreateCommand?: string;
    };
    const cliArgs = ["add-worktree", repoPath, wtPath, branch];
    if (createBranch) cliArgs.push("--create-branch");
    if (linkHerd) cliArgs.push("--link-herd");
    if (copyConfigs !== false) cliArgs.push("--copy-configs");
    if (cloneDb) cliArgs.push("--clone-db");

    await runCli(cliArgs);

    if (postCreateCommand) {
      const safeCwd = await resolveSafeDir(wtPath);
      const parts = postCreateCommand.trim().split(/\s+/);
      const bin = parts[0];
      const cmdArgs = parts.slice(1);
      if (bin) {
        spawn(bin, cmdArgs, { cwd: safeCwd, shell: false, detached: false, stdio: "ignore" });
      }
    }

    return { content: [{ type: "text", text: "Worktree added successfully." }] };
  },

  remove_worktree: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, path: wtPath, force } = args as { repoPath: string; path: string; force: boolean };
    const cliArgs = ["remove-worktree", repoPath, wtPath];
    if (force) cliArgs.push("--force");
    await runCli(cliArgs);
    return { content: [{ type: "text", text: "Worktree removed successfully." }] };
  },

  get_worktree_state: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath } = args as { wtPath: string };
    try {
      const currentBranch = await runCli(["get-current-branch", wtPath]);
      const changes = await runCli(["get-changes", wtPath]);
      const lastCommit = await runCli(["get-last-commit", wtPath]);

      const state = {
        path: wtPath,
        branch: (currentBranch as { branch: string }).branch,
        lastCommit,
        changes: (changes as { changes?: string }).changes,
      };
      return { content: [{ type: "text", text: JSON.stringify(state) }] };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error getting worktree state: ${errorMsg}` }], isError: true };
    }
  },
};

export const worktreeTools: ToolModule = {
  definitions,
  handlers,
};
