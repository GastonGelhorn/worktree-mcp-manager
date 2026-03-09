/**
 * Environment and navigation tools (environment-specific, TypeScript-only)
 */

import type { ToolDefinition, ToolHandler, ToolModule, ToolResponse } from "./types.js";
import { spawn, execFile } from "child_process";
import { resolveSafeDir, CLI_BIN } from "../utils.js";
import { openInCursor, openInVSCode, openInClaudeDesktop, openClaudeCLI } from "./ide-utils.js";

// Process management (in-memory, TypeScript-only)
const runningProcesses = new Map<string, ReturnType<typeof spawn>>();

const definitions: ToolDefinition[] = [
  {
    name: "navigate_to_worktree",
    description: "Open the given worktree directory in a new editor/IDE window. Detects the current environment automatically: Claude Desktop opens a new Claude app instance, Claude CLI opens a new terminal with Claude running, Cursor opens a new Cursor window. Path must be an existing directory under the user's home.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the worktree directory (must exist and be under $HOME)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "start_process",
    description: "[WARNING: EXECUTION] Start a background process in a worktree. Be cautious with commands that mutate state or install raw dependencies. Ensure the user understands what command is being run.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        command: { type: "string" },
      },
      required: ["path", "command"],
    },
  },
  {
    name: "stop_process",
    description: "Stop a background process running in a worktree",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
  },
  {
    name: "herd_link",
    description: "Link a directory to Laravel Herd",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        projectName: { type: "string" },
      },
      required: ["path", "projectName"],
    },
  },
  {
    name: "herd_unlink",
    description: "Unlink a directory from Laravel Herd",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        projectName: { type: "string" },
      },
      required: ["path", "projectName"],
    },
  },
  {
    name: "open_in_editor",
    description: "Open a worktree in a specific editor or IDE (cursor, vscode, claude-desktop, claude-cli, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the worktree directory" },
        editor: { type: "string", description: "Editor to open: 'cursor', 'vscode', 'claude-desktop', 'claude-cli'. Auto-detected if omitted." },
      },
      required: ["path"],
    },
  },
];

const handlers: Record<string, ToolHandler> = {
  navigate_to_worktree: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { path: wtPath } = args as { path: string };
    const resolvedPath = await resolveSafeDir(wtPath);
    const entrypoint = process.env.CLAUDE_CODE_ENTRYPOINT;

    if (entrypoint === "claude-desktop") {
      await openInClaudeDesktop(resolvedPath);
      return { content: [{ type: "text", text: `Opened Claude Desktop at ${resolvedPath}` }] };
    }
    if (entrypoint === "cli") {
      await openClaudeCLI(resolvedPath);
      return { content: [{ type: "text", text: `Opened terminal with Claude CLI at ${resolvedPath}` }] };
    }
    await openInCursor(resolvedPath);
    return { content: [{ type: "text", text: `Opened Cursor at ${resolvedPath}` }] };
  },

  start_process: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { path: wtPath, command } = args as { path: string; command: string };
    const safeCwd = await resolveSafeDir(wtPath);
    if (runningProcesses.has(safeCwd)) {
      return { content: [{ type: "text", text: `A process is already running in ${safeCwd}. Stop it first.` }], isError: true };
    }
    const parts = command.trim().split(/\s+/);
    const bin = parts[0];
    const cmdArgs = parts.slice(1);
    if (!bin) throw new Error("Empty command");
    const proc = spawn(bin, cmdArgs, { cwd: safeCwd, shell: false, detached: false });
    runningProcesses.set(safeCwd, proc);
    proc.on("close", () => runningProcesses.delete(safeCwd));
    return { content: [{ type: "text", text: `Process started in ${safeCwd}: ${command}` }] };
  },

  stop_process: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { path: wtPath } = args as { path: string };
    const safeCwd = await resolveSafeDir(wtPath);
    const proc = runningProcesses.get(safeCwd);
    if (!proc) {
      return { content: [{ type: "text", text: `No running process found for ${safeCwd}` }], isError: true };
    }
    proc.kill("SIGTERM");
    runningProcesses.delete(safeCwd);
    return { content: [{ type: "text", text: `Process stopped in ${safeCwd}` }] };
  },

  herd_link: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { path: wtPath, projectName } = args as { path: string; projectName: string };
    execFile(CLI_BIN, ["herd-link", wtPath, projectName]);
    return { content: [{ type: "text", text: "Herd linked successfully." }] };
  },

  herd_unlink: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { path: wtPath, projectName } = args as { path: string; projectName: string };
    execFile(CLI_BIN, ["herd-unlink", wtPath, projectName]);
    return { content: [{ type: "text", text: "Herd unlinked successfully." }] };
  },

  open_in_editor: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { path: wtPath, editor } = args as { path: string; editor?: string };
    const resolvedPath = await resolveSafeDir(wtPath);
    const target = editor || process.env.CLAUDE_CODE_ENTRYPOINT || "cursor";

    try {
      if (target === "vscode") {
        await openInVSCode(resolvedPath);
        return { content: [{ type: "text", text: `Opened ${resolvedPath} in VS Code` }] };
      } else if (target === "claude-desktop") {
        await openInClaudeDesktop(resolvedPath);
        return { content: [{ type: "text", text: `Opened ${resolvedPath} in Claude Desktop` }] };
      } else if (target === "cli" || target === "claude-cli") {
        await openClaudeCLI(resolvedPath);
        return { content: [{ type: "text", text: `Opened terminal with Claude CLI at ${resolvedPath}` }] };
      } else {
        await openInCursor(resolvedPath);
        return { content: [{ type: "text", text: `Opened ${resolvedPath} in Cursor` }] };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Failed to open in ${target}: ${errorMsg}` }], isError: true };
    }
  },
};

export const environmentTools: ToolModule = {
  definitions,
  handlers,
};
