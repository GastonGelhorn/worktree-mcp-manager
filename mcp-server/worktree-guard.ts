/**
 * Worktree Guard — Automatic agent claim protection
 *
 * Prevents two agents (e.g., Claude in Cursor + Claude in VS Code)
 * from accidentally working on the same worktree simultaneously.
 *
 * How it works:
 * 1. Each MCP server process gets a unique session ID on startup
 * 2. When any tool that modifies a worktree is called, the guard
 *    automatically claims it for this session
 * 3. If another MCP session already holds the claim, the tool call
 *    is blocked with a clear error + suggestion to create a new worktree
 * 4. On process exit, all claims for this session are released
 */

import fs from "fs";
import path from "path";
import os from "os";
import type { ToolResponse } from "./tools/types.js";

// ── Session Identity ─────────────────────────────────────────────────

/** Generate a short unique session ID (hostname + pid + timestamp) */
function generateSessionId(): string {
  const host = os.hostname().slice(0, 8);
  const pid = process.pid;
  const ts = Date.now().toString(36);
  return `${host}-${pid}-${ts}`;
}

export const SESSION_ID = generateSessionId();

// Try to detect which IDE launched this MCP server
function detectIde(): string {
  const ppidEnv = process.env.TERM_PROGRAM || "";
  const parentCmd = process.env._ || "";

  if (ppidEnv.includes("vscode") || parentCmd.includes("code")) return "VS Code";
  if (parentCmd.includes("cursor") || process.env.CURSOR_CHANNEL) return "Cursor";
  if (parentCmd.includes("claude") || process.env.CLAUDE_CODE) return "Claude Code";
  if (parentCmd.includes("windsurf")) return "Windsurf";
  return "Unknown IDE";
}

export const IDE_NAME = detectIde();

// ── Claims Storage ───────────────────────────────────────────────────

interface SessionClaim {
  sessionId: string;
  ide: string;
  claimedAt: number;
  heartbeatAt: number;
}

const CLAIMS_DIR = path.join(os.homedir(), ".worktree-mcp");
const CLAIMS_FILE = path.join(CLAIMS_DIR, "session-claims.json");

/** Heartbeat timeout: 3 minutes — if a session hasn't updated in 3 min, it's dead */
const STALE_TIMEOUT_MS = 3 * 60 * 1000;

function ensureDir(): void {
  if (!fs.existsSync(CLAIMS_DIR)) {
    fs.mkdirSync(CLAIMS_DIR, { recursive: true });
  }
}

function loadSessionClaims(): Map<string, SessionClaim> {
  try {
    if (fs.existsSync(CLAIMS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CLAIMS_FILE, "utf-8"));
      return new Map(Object.entries(data));
    }
  } catch {
    // Corrupted file — start fresh
  }
  return new Map();
}

function saveSessionClaims(claims: Map<string, SessionClaim>): void {
  ensureDir();
  fs.writeFileSync(CLAIMS_FILE, JSON.stringify(Object.fromEntries(claims), null, 2), "utf-8");
}

function cleanupStale(claims: Map<string, SessionClaim>): boolean {
  const now = Date.now();
  let changed = false;
  for (const [wtPath, claim] of claims) {
    if (now - claim.heartbeatAt > STALE_TIMEOUT_MS) {
      claims.delete(wtPath);
      changed = true;
    }
  }
  return changed;
}

// ── Tools that MODIFY worktree files (need protection) ───────────────

const MODIFYING_TOOLS = new Set([
  // Git write operations
  "git_commit",
  "git_add",
  "git_checkout",
  "git_pull",
  "git_push",
  "git_fetch",
  "git_stash",
  "git_stash_pop",
  "git_reset",
  "git_revert",

  // Merge operations
  "merge_worktree",
  "merge_abort",
  "resolve_conflict",

  // Worktree modifications
  "remove_worktree",

  // Workflow/hook execution
  "execute_workflow",
  "execute_hook",

  // File operations
  "copy_env_file",
  "open_in_cursor",
  "open_in_vscode",
]);

/** Read-only tools that DON'T need protection (just observing) */
// Everything not in MODIFYING_TOOLS is treated as read-only

// ── Public API ───────────────────────────────────────────────────────

/**
 * Check if a tool call should be guarded, and if so, verify the claim.
 *
 * Returns null if the tool is allowed to proceed.
 * Returns a ToolResponse error if blocked by another session.
 */
export function guardWorktree(
  toolName: string,
  args: Record<string, unknown>
): ToolResponse | null {
  // Only guard tools that modify worktree files
  if (!MODIFYING_TOOLS.has(toolName)) {
    return null;
  }

  // Extract worktree path from args
  const wtPath = (args.wtPath as string) || (args.worktreePath as string);
  if (!wtPath) {
    return null; // No worktree path — can't guard
  }

  // Normalize path for consistent matching
  const normalizedPath = path.resolve(wtPath);

  // Load current claims, cleanup stale ones
  const claims = loadSessionClaims();
  const wasStale = cleanupStale(claims);

  const existingClaim = claims.get(normalizedPath);

  // Case 1: No claim exists — auto-claim for this session
  if (!existingClaim) {
    const now = Date.now();
    claims.set(normalizedPath, {
      sessionId: SESSION_ID,
      ide: IDE_NAME,
      claimedAt: now,
      heartbeatAt: now,
    });
    saveSessionClaims(claims);
    return null; // Allowed
  }

  // Case 2: We already own the claim — refresh heartbeat and proceed
  if (existingClaim.sessionId === SESSION_ID) {
    existingClaim.heartbeatAt = Date.now();
    saveSessionClaims(claims);
    return null; // Allowed
  }

  // Case 3: Another session owns it — BLOCK
  const ageMinutes = Math.floor((Date.now() - existingClaim.heartbeatAt) / 1000 / 60);
  const wtName = path.basename(normalizedPath);

  return {
    content: [
      {
        type: "text",
        text: [
          `⚠️  WORKTREE LOCKED — Another agent is already working here.`,
          ``,
          `Worktree:  ${normalizedPath}`,
          `Locked by: ${existingClaim.ide} (session ${existingClaim.sessionId})`,
          `Active:    ${ageMinutes}m ago`,
          ``,
          `To avoid conflicts between two agents editing the same files:`,
          ``,
          `→ Option 1: Create a NEW worktree for your task:`,
          `   Use create_worktree with a different branch name.`,
          ``,
          `→ Option 2: If the other agent has finished or crashed,`,
          `   use agent_force_release_worktree to release the lock.`,
          ``,
          `This protection prevents two AI agents from accidentally`,
          `overwriting each other's changes in the same worktree.`,
        ].join("\n"),
      },
    ],
    isError: true,
  };
}

/**
 * Release all claims held by the current session.
 * Called on process exit.
 */
export function releaseAllSessionClaims(): void {
  try {
    const claims = loadSessionClaims();
    let changed = false;

    for (const [wtPath, claim] of claims) {
      if (claim.sessionId === SESSION_ID) {
        claims.delete(wtPath);
        changed = true;
      }
    }

    if (changed) {
      saveSessionClaims(claims);
    }
  } catch {
    // Best-effort cleanup on exit
  }
}

/**
 * Force release a claim on a specific worktree (for UI or manual override).
 */
export function forceReleaseClaim(wtPath: string): void {
  const claims = loadSessionClaims();
  const normalizedPath = path.resolve(wtPath);
  claims.delete(normalizedPath);
  saveSessionClaims(claims);
}

/**
 * List all active session claims (for the Agent UI tab).
 */
export function listSessionClaims(): Array<{
  wtPath: string;
  sessionId: string;
  ide: string;
  claimedAt: string;
  lastHeartbeat: string;
  isCurrentSession: boolean;
}> {
  const claims = loadSessionClaims();
  cleanupStale(claims);
  saveSessionClaims(claims);

  return Array.from(claims.entries()).map(([wtPath, claim]) => ({
    wtPath,
    sessionId: claim.sessionId,
    ide: claim.ide,
    claimedAt: new Date(claim.claimedAt).toISOString(),
    lastHeartbeat: new Date(claim.heartbeatAt).toISOString(),
    isCurrentSession: claim.sessionId === SESSION_ID,
  }));
}
