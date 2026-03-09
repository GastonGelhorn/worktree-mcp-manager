import fs from "fs";
import path from "path";
import os from "os";

const LOG_DIR = path.join(os.homedir(), ".worktree-mcp", "logs");
const LOG_FILE = path.join(LOG_DIR, "audit.jsonl");

let initialized = false;

function ensureDir() {
  if (initialized) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    initialized = true;
  } catch {
    // ignore — best effort logging
  }
}

export interface AuditEntry {
  timestamp: string;
  tool: string;
  args: Record<string, unknown>;
  success: boolean;
  error?: string;
  durationMs?: number;
}

export function logAudit(entry: AuditEntry): void {
  ensureDir();
  try {
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(LOG_FILE, line, "utf-8");
  } catch {
    // best effort — never block MCP operations
  }
}
