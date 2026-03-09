/**
 * Agent coordination and claiming tools
 */

import type { ToolDefinition, ToolHandler, ToolModule, ToolResponse } from "./types.js";
import fs from "fs";
import path from "path";
import os from "os";
import { forceReleaseClaim, listSessionClaims, SESSION_ID, IDE_NAME } from "../worktree-guard.js";

// In-memory agent claims (synced with persistent storage)
interface AgentClaim {
  worktreePath: string;
  agentId: string;
  timestamp: number;
  heartbeatAt: number;
}

// Claims file path
const CLAIMS_FILE_PATH = path.join(os.homedir(), ".worktree-mcp", "agent-claims.json");

// In-memory cache
let claims = new Map<string, AgentClaim>();

// Heartbeat timeout in milliseconds (5 minutes)
const HEARTBEAT_TIMEOUT = 5 * 60 * 1000;

/**
 * Load claims from disk
 */
function loadClaims(): Map<string, AgentClaim> {
  try {
    if (fs.existsSync(CLAIMS_FILE_PATH)) {
      const data = fs.readFileSync(CLAIMS_FILE_PATH, "utf-8");
      const parsed = JSON.parse(data);
      if (typeof parsed === "object" && parsed !== null) {
        return new Map(Object.entries(parsed));
      }
    }
  } catch (error) {
    // Fall back to empty map on error (don't crash)
    console.error("Error loading claims from disk:", error);
  }
  return new Map();
}

/**
 * Save claims to disk
 */
function saveClaims(claimsMap: Map<string, AgentClaim>): void {
  try {
    const dir = path.dirname(CLAIMS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = Object.fromEntries(claimsMap);
    fs.writeFileSync(CLAIMS_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    // Log error but don't crash - in-memory cache is still valid
    console.error("Error saving claims to disk:", error);
  }
}

function cleanupStaleHeartbeats(): void {
  const now = Date.now();
  const staleKeys: string[] = [];

  for (const [key, claim] of claims) {
    if (now - claim.heartbeatAt > HEARTBEAT_TIMEOUT) {
      staleKeys.push(key);
    }
  }

  if (staleKeys.length > 0) {
    for (const key of staleKeys) {
      claims.delete(key);
    }
    saveClaims(claims);
  }
}

const definitions: ToolDefinition[] = [
  {
    name: "agent_claim_worktree",
    description: "Claim exclusive access to a worktree for an AI agent session. Returns true if claimed, false if already claimed by another agent.",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string", description: "Absolute path to the worktree to claim" },
        agentId: {
          type: "string",
          description: "Unique identifier for this agent session (e.g., UUID, session ID, or 'agent-123')",
        },
      },
      required: ["wtPath", "agentId"],
    },
  },
  {
    name: "agent_release_worktree",
    description: "Release exclusive access claim on a worktree",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string" },
        agentId: { type: "string" },
      },
      required: ["wtPath", "agentId"],
    },
  },
  {
    name: "agent_list_claims",
    description: "List all currently active agent claims on worktrees",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "agent_heartbeat",
    description: "Update heartbeat for an agent claim to prevent timeout. Must be called periodically (at least every 5 minutes) to maintain the claim.",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string" },
        agentId: { type: "string" },
      },
      required: ["wtPath", "agentId"],
    },
  },
  {
    name: "agent_force_release_worktree",
    description: "Force-release a worktree lock held by another agent session. Use this when the other agent has crashed or finished but its lock wasn't cleaned up.",
    inputSchema: {
      type: "object",
      properties: {
        wtPath: { type: "string", description: "Absolute path to the locked worktree" },
      },
      required: ["wtPath"],
    },
  },
  {
    name: "agent_session_info",
    description: "Get information about the current MCP session and all active worktree locks across all agent sessions.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

const handlers: Record<string, ToolHandler> = {
  agent_claim_worktree: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath, agentId } = args as { wtPath: string; agentId: string };

    // Load fresh from disk
    claims = loadClaims();
    cleanupStaleHeartbeats();

    const existingClaim = claims.get(wtPath);
    if (existingClaim && existingClaim.agentId !== agentId) {
      return {
        content: [
          {
            type: "text",
            text: `Worktree "${wtPath}" is already claimed by agent "${existingClaim.agentId}". Cannot claim.`,
          },
        ],
        isError: true,
      };
    }

    const now = Date.now();
    claims.set(wtPath, {
      worktreePath: wtPath,
      agentId,
      timestamp: now,
      heartbeatAt: now,
    });

    // Persist to disk
    saveClaims(claims);

    return {
      content: [
        {
          type: "text",
          text: `Successfully claimed worktree "${wtPath}" for agent "${agentId}". Keep heartbeat alive with agent_heartbeat calls.`,
        },
      ],
    };
  },

  agent_release_worktree: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath, agentId } = args as { wtPath: string; agentId: string };

    // Load fresh from disk
    claims = loadClaims();

    const claim = claims.get(wtPath);
    if (!claim) {
      return {
        content: [{ type: "text", text: `No claim found for worktree "${wtPath}".` }],
        isError: true,
      };
    }

    if (claim.agentId !== agentId) {
      return {
        content: [
          {
            type: "text",
            text: `Cannot release claim on "${wtPath}" - owned by agent "${claim.agentId}", not "${agentId}".`,
          },
        ],
        isError: true,
      };
    }

    claims.delete(wtPath);

    // Persist to disk
    saveClaims(claims);

    return {
      content: [
        {
          type: "text",
          text: `Released claim on worktree "${wtPath}".`,
        },
      ],
    };
  },

  agent_list_claims: async (): Promise<ToolResponse> => {
    // Load fresh from disk
    claims = loadClaims();
    cleanupStaleHeartbeats();

    const claimsList = Array.from(claims.entries()).map(([wtPath, claim]) => ({
      wtPath,
      agentId: claim.agentId,
      claimedAt: new Date(claim.timestamp).toISOString(),
      lastHeartbeat: new Date(claim.heartbeatAt).toISOString(),
    }));

    return {
      content: [
        {
          type: "text",
          text: claimsList.length === 0 ? "No active agent claims." : JSON.stringify(claimsList, null, 2),
        },
      ],
    };
  },

  agent_heartbeat: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath, agentId } = args as { wtPath: string; agentId: string };

    // Load fresh from disk
    claims = loadClaims();

    const claim = claims.get(wtPath);
    if (!claim) {
      return {
        content: [{ type: "text", text: `No claim found for worktree "${wtPath}".` }],
        isError: true,
      };
    }

    if (claim.agentId !== agentId) {
      return {
        content: [
          {
            type: "text",
            text: `Cannot update heartbeat for "${wtPath}" - owned by agent "${claim.agentId}", not "${agentId}".`,
          },
        ],
        isError: true,
      };
    }

    claim.heartbeatAt = Date.now();

    // Persist to disk
    saveClaims(claims);

    return {
      content: [
        {
          type: "text",
          text: `Heartbeat updated for agent "${agentId}" on worktree "${wtPath}".`,
        },
      ],
    };
  },

  agent_force_release_worktree: async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { wtPath } = args as { wtPath: string };

    forceReleaseClaim(wtPath);

    return {
      content: [
        {
          type: "text",
          text: `Force-released lock on worktree "${wtPath}". You can now work on it freely.`,
        },
      ],
    };
  },

  agent_session_info: async (): Promise<ToolResponse> => {
    const activeLocks = listSessionClaims();

    const info = {
      currentSession: {
        sessionId: SESSION_ID,
        ide: IDE_NAME,
      },
      activeLocks: activeLocks.map((lock) => ({
        worktree: lock.wtPath,
        heldBy: `${lock.ide} (${lock.sessionId})`,
        since: lock.claimedAt,
        lastActivity: lock.lastHeartbeat,
        isThisSession: lock.isCurrentSession,
      })),
    };

    const text = activeLocks.length === 0
      ? `Current session: ${IDE_NAME} (${SESSION_ID})\n\nNo worktrees are currently locked by any agent.`
      : `Current session: ${IDE_NAME} (${SESSION_ID})\n\nActive worktree locks:\n${activeLocks
          .map(
            (l) =>
              `  ${l.isCurrentSession ? "→" : " "} ${path.basename(l.wtPath)} — ${l.ide} (${l.sessionId})${l.isCurrentSession ? " [this session]" : ""}`
          )
          .join("\n")}`;

    return {
      content: [{ type: "text", text }],
    };
  },
};

export const agentTools: ToolModule = {
  definitions,
  handlers,
};
