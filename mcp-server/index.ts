/**
 * MCP Server for Git Worktree Management - Modular Architecture
 * This is the new refactored entry point that imports all tool modules
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { RateLimiter } from "./rate-limiter.js";
import { logAudit } from "./audit-log.js";
import { isRepoAllowed } from "./utils.js";
import { guardWorktree, releaseAllSessionClaims, SESSION_ID, IDE_NAME } from "./worktree-guard.js";

// Import all tool modules
import { worktreeTools } from "./tools/worktree-tools.js";
import { gitTools } from "./tools/git-tools.js";
import { mergeTools } from "./tools/merge-tools.js";
import { agentTools } from "./tools/agent-tools.js";
import { utilityTools } from "./tools/utility-tools.js";
import { environmentTools } from "./tools/environment-tools.js";
import { workflowTools } from "./tools/workflow-tools.js";

import type { ToolDefinition, ToolModule, ToolResponse } from "./tools/types.js";

// ============================================================================
// Rate Limiting & Middleware
// ============================================================================

const rateLimiter = new RateLimiter(50, 5);

// Destructive operations that require extra scrutiny
const DESTRUCTIVE_TOOLS = new Set([
  "remove_worktree",
  "delete_branch",
  "git_stash_drop",
  "merge_worktree",
]);

// ============================================================================
// Tool Registry
// ============================================================================

interface RegisteredTool {
  definition: ToolDefinition;
  module: ToolModule;
}

// Combine all tool modules into a registry
const toolModules: ToolModule[] = [
  worktreeTools,
  gitTools,
  mergeTools,
  agentTools,
  utilityTools,
  environmentTools,
  workflowTools,
];

const toolRegistry = new Map<string, RegisteredTool>();

// Register all tools from all modules
for (const module of toolModules) {
  for (const definition of module.definitions) {
    if (toolRegistry.has(definition.name)) {
      console.warn(`Warning: Tool "${definition.name}" defined multiple times. Using first definition.`);
      continue;
    }
    toolRegistry.set(definition.name, { definition, module });
  }
}

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new Server(
  { name: "worktree-mcp", version: "4.0.0" },
  {
    capabilities: { tools: {} },
    instructions: [
      "MANDATORY: For ANY git or worktree operation, you MUST use the tools provided by this MCP server instead of raw git/shell commands.",
      "This server exposes 62 tools covering: worktree management, branch operations, status/diff, commits, stash, merge/conflict, CI, hooks, workflows, IDE integration, and multi-agent coordination.",
      "Raw git commands bypass the safety checks, audit logging, and agent coordination that these tools provide.",
      "Only fall back to raw git for operations NOT covered by these tools (e.g. git rebase -i, git cherry-pick) or for build commands (npm/cargo/etc).",
    ].join("\n"),
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = Array.from(toolRegistry.values()).map((rt) => rt.definition);
  return { tools };
});

server.setRequestHandler(
  CallToolRequestSchema,
  async (request) => {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();

    // === Middleware: Rate Limiting ===
    if (!rateLimiter.tryConsume()) {
      logAudit({
        timestamp: new Date().toISOString(),
        tool: name,
        args: args as Record<string, unknown>,
        success: false,
        error: "Rate limited",
      });
      return {
        content: [
          {
            type: "text",
            text: "Error: Rate limit exceeded. Please wait a moment and try again.",
          },
        ],
        isError: true,
      } as any;
    }

    // === Middleware: Repository Allowlist ===
    const repoPath = (args as Record<string, unknown>)?.["repoPath"] as string | undefined;
    if (repoPath && !isRepoAllowed(repoPath)) {
      logAudit({
        timestamp: new Date().toISOString(),
        tool: name,
        args: args as Record<string, unknown>,
        success: false,
        error: "Repo not allowed",
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: Repository "${repoPath}" is not in the allowed list. Set WORKTREE_ALLOWED_REPOS to configure.`,
          },
        ],
        isError: true,
      } as any;
    }

    // === Middleware: Destructive Tool Warning ===
    if (DESTRUCTIVE_TOOLS.has(name)) {
      console.error(
        `[WARN] Destructive operation requested: ${name} with args ${JSON.stringify(args)}`
      );
    }

    // === Middleware: Worktree Guard (auto-claim protection) ===
    const guardResult = guardWorktree(name, args as Record<string, unknown>);
    if (guardResult) {
      logAudit({
        timestamp: new Date().toISOString(),
        tool: name,
        args: args as Record<string, unknown>,
        success: false,
        error: "Worktree locked by another agent session",
      });
      return guardResult as any;
    }

    let success = true;
    let errMsg = "";

    try {
      // === Handler Routing ===
      const registered = toolRegistry.get(name);
      if (!registered) {
        throw new Error(`Unknown tool: ${name}`);
      }

      const handler = registered.module.handlers[name];
      if (!handler) {
        throw new Error(`No handler for tool: ${name}`);
      }

      const result: ToolResponse = await handler(args as Record<string, unknown>);
      return result as any;
    } catch (error: unknown) {
      success = false;
      errMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${errMsg}` }],
        isError: true,
      } as any;
    } finally {
      // === Audit Logging ===
      logAudit({
        timestamp: new Date().toISOString(),
        tool: name,
        args: args as Record<string, unknown>,
        success,
        ...(errMsg ? { error: errMsg } : {}),
        durationMs: Date.now() - startTime,
      });
    }
  },
) as any;

// ============================================================================
// Server Startup
// ============================================================================

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Git Worktree MCP Manager server v4.0.0 running on stdio (modular architecture)");
  console.error(`Registered ${toolRegistry.size} tools from ${toolModules.length} modules`);
  console.error(`Session: ${SESSION_ID} (${IDE_NAME})`);
}

// Release all worktree claims when the process exits
process.on("exit", () => releaseAllSessionClaims());
process.on("SIGINT", () => { releaseAllSessionClaims(); process.exit(0); });
process.on("SIGTERM", () => { releaseAllSessionClaims(); process.exit(0); });

run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
