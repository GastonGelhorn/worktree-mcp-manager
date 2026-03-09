/**
 * Git operation tools
 */

import type { ToolDefinition, ToolHandler, ToolModule, ToolResponse } from "./types.js";
import { execFile } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";
import os from "os";
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
    name: "get_changes",
    description: "Get uncommitted changes in a worktree",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string" },
      },
      required: ["wtPath"],
    },
  },
  {
    name: "stage_files",
    description: "Stage specific files or directories in a worktree for committing.",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string" },
        paths: {
          type: "array",
          items: { type: "string" },
          description: "List of files/directories to stage (relative to worktree root)",
        },
      },
      required: ["wtPath", "paths"],
    },
  },
  {
    name: "unstage_files",
    description: "Unstage specific files or directories in a worktree.",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string" },
        paths: {
          type: "array",
          items: { type: "string" },
          description: "List of files/directories to unstage (relative to worktree root)",
        },
      },
      required: ["wtPath", "paths"],
    },
  },
  {
    name: "commit",
    description:
      "[WARNING: HISTORY CHANGE] Commit staged changes in a worktree. This modifies local git history. Verify the staged changes and the commit message are correct.\n\nCRITICAL: Before calling this tool, you MUST call 'get_commit_template' to format your commit message properly according to the user's settings. Do not invent your own structure.",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string" },
        message: { type: "string" },
        allowUncommitted: {
          type: "boolean",
          description: "Set this to true if the user explicitly confirms they want to commit despite untracked or unstaged files remaining in the directory.",
        },
      },
      required: ["wtPath", "message"],
    },
  },
  {
    name: "pull",
    description: "[WARNING: STATE CHANGE] Pull changes from the remote repository into the worktree. This may cause merge conflicts. Verify readiness with the user if there are uncommitted changes.",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string" },
      },
      required: ["wtPath"],
    },
  },
  {
    name: "push",
    description: "[DANGER: REMOTE IMPACT] Push local commits from a worktree to the remote repository. You MUST explicitly ask the user for confirmation before calling this tool to avoid pushing broken code.",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string" },
      },
      required: ["wtPath"],
    },
  },
  {
    name: "fetch",
    description: "Fetch updates from the remote repository without modifying local branches",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
      },
      required: ["repoPath"],
    },
  },
  {
    name: "git_checkout",
    description: "Checkout a branch in a repository. CRITICAL FOR AI AGENTS: If this fails because 'branch is already checked out in another worktree', you MUST use the 'navigate_to_worktree' tool instead to move your context there.",
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
    name: "git_stash",
    description: "Stash changes in a repository",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
        message: { type: "string" },
      },
      required: ["repoPath", "message"],
    },
  },
  {
    name: "git_stash_pop",
    description: "Pop a stash by index",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
        index: { type: "number" },
      },
      required: ["repoPath", "index"],
    },
  },
  {
    name: "git_stash_drop",
    description: "[DANGER: PERMANENT] Drop a stash by index. This permanently deletes the stashed changes. You MUST explicitly ask the user for confirmation before calling this tool.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
        index: { type: "number" },
      },
      required: ["repoPath", "index"],
    },
  },
  {
    name: "list_stashes",
    description: "List all stashes in a repository",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
      },
      required: ["repoPath"],
    },
  },
  {
    name: "delete_branch",
    description: "[DANGER: DESTRUCTIVE] Delete a branch in a repository. This destroys commit history. You MUST explicitly ask the user for confirmation before calling this tool.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
        branch: { type: "string" },
        force: { type: "boolean" },
      },
      required: ["repoPath", "branch", "force"],
    },
  },
  {
    name: "grab_file",
    description: "[WARNING: OVERWRITES DATA] Checkout a specific file from another branch into the current worktree. This will immediately overwrite the current file state. Verify with the user if there are unsaved changes in that file.",
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string" },
        wtPath: { type: "string" },
        srcBranch: { type: "string" },
        file: { type: "string" },
      },
      required: ["repoPath", "wtPath", "srcBranch", "file"],
    },
  },
  // NOTE: get_file_diff_sides and resolve_shortcut removed — awaiting CLI backend support.
  // When CLI implements these commands, re-add the definitions here.
];

const handlers: Record<string, ToolHandler> = {
  get_changes: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath } = args as { wtPath: string };
    const result = await runCli(["get-changes", wtPath]);
    return { content: [{ type: "text", text: (result as { changes?: string }).changes || "No changes" }] };
  },

  stage_files: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath, paths } = args as { wtPath: string; paths: string[] };
    const cliArgs = ["stage-files", wtPath, ...paths];
    const result = await runCli(cliArgs);
    return { content: [{ type: "text", text: (result as { output?: string }).output || "Files staged successfully" }] };
  },

  unstage_files: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath, paths } = args as { wtPath: string; paths: string[] };
    const cliArgs = ["unstage-files", wtPath, ...paths];
    const result = await runCli(cliArgs);
    return { content: [{ type: "text", text: (result as { output?: string }).output || "Files unstaged successfully" }] };
  },

  commit: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath, message, allowUncommitted } = args as { wtPath: string; message: string; allowUncommitted?: boolean };

    if (!allowUncommitted) {
      const changesResult = await runCli(["get-changes", wtPath]);
      const rawChanges = (changesResult as { changes?: string }).changes || "";
      if (rawChanges) {
        const uncommittedLines = rawChanges
          .split("\n")
          .map((line: string) => line.trimEnd())
          .filter((line: string) => {
            if (line.length < 3) return false;
            const x = line[0];
            const y = line[1];
            return (x === "?" && y === "?") || (y !== " " && y !== undefined);
          });

        if (uncommittedLines.length > 0) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text:
                  "Error: There are untracked or unstaged files in the worktree.\n" +
                  uncommittedLines.join("\n") +
                  "\n\nPlease ask the user if they want to stage these files before committing. If they explicitly confirm they want to proceed without these files, call this tool again with 'allowUncommitted: true'.",
              },
            ],
          };
        }
      }
    }

    const result = await runCli(["commit", "--message", message || "", wtPath]);
    return { content: [{ type: "text", text: (result as { output?: string }).output || "Committed successfully" }] };
  },

  pull: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath } = args as { wtPath: string };
    const result = await runCli(["pull", wtPath]);
    return { content: [{ type: "text", text: (result as { output?: string }).output || "Pulled successfully" }] };
  },

  push: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath } = args as { wtPath: string };
    const result = await runCli(["push", wtPath]);
    return { content: [{ type: "text", text: (result as { output?: string }).output || "Pushed successfully" }] };
  },

  fetch: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath } = args as { repoPath: string };
    const result = await runCli(["fetch", repoPath]);
    return { content: [{ type: "text", text: (result as { output?: string }).output || "Fetched successfully" }] };
  },

  git_checkout: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, branch } = args as { repoPath: string; branch: string };
    await runCli(["git-checkout", repoPath, branch]);
    return { content: [{ type: "text", text: `Checked out ${branch}` }] };
  },

  git_stash: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, message } = args as { repoPath: string; message: string };
    const cliArgs = ["git-stash", repoPath, "--message", message || ""];
    const result = await runCli(cliArgs);
    return { content: [{ type: "text", text: (result as { output?: string }).output || "Stashed" }] };
  },

  git_stash_pop: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, index } = args as { repoPath: string; index: number };
    const result = await runCli(["git-stash-pop", repoPath, String(Math.floor(index))]);
    return { content: [{ type: "text", text: (result as { output?: string }).output || "Popped" }] };
  },

  git_stash_drop: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, index } = args as { repoPath: string; index: number };
    await runCli(["git-stash-drop", repoPath, String(Math.floor(index))]);
    return { content: [{ type: "text", text: "Dropped" }] };
  },

  list_stashes: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath } = args as { repoPath: string };
    const result = await runCli(["list-stashes", repoPath]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },

  delete_branch: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, branch, force } = args as { repoPath: string; branch: string; force: boolean };
    const cliArgs = ["delete-branch", repoPath, branch];
    if (force) cliArgs.push("--force");
    await runCli(cliArgs);
    return { content: [{ type: "text", text: `Deleted branch: ${branch}` }] };
  },

  grab_file: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { repoPath, wtPath, srcBranch, file } = args as { repoPath: string; wtPath: string; srcBranch: string; file: string };
    const result = await runCli(["grab-file", repoPath, wtPath, srcBranch, file]);
    return { content: [{ type: "text", text: (result as { message?: string }).message || "File grabbed" }] };
  },

  // Placeholder handlers removed — tools not exposed until CLI backend supports them.
};

export const gitTools: ToolModule = {
  definitions,
  handlers,
};
