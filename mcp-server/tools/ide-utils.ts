/**
 * Shared IDE utilities — single source of truth for IDE opening/detection logic.
 * Used by environment-tools, utility-tools, and workflow-tools.
 */
import { execFile, exec } from "child_process";
import { existsSync } from "fs";
import path from "path";

export interface IdeOpenResult {
  success: boolean;
  ide: string;
  message: string;
}

/**
 * Find the Cursor CLI binary path
 */
export function findCursorCli(): string {
  // Check common macOS location
  const macosPath = "/Applications/Cursor.app/Contents/Resources/app/bin/cursor";
  if (process.platform === "darwin" && existsSync(macosPath)) {
    return macosPath;
  }

  // Fallback to PATH (works on all platforms)
  return "cursor";
}

/**
 * Open a directory in Cursor IDE
 */
export function openInCursor(dirPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cursorPath = findCursorCli();
    execFile(cursorPath, [dirPath], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Open a directory in VS Code
 */
export function openInVSCode(dirPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("code", [dirPath], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Open a directory in Claude Desktop app
 */
export function openInClaudeDesktop(dirPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("open", ["-n", "-a", "Claude", "--args", dirPath], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Open a directory in macOS Terminal or iTerm via AppleScript
 * Tries iTerm2 first, falls back to Terminal
 */
export function openClaudeCLI(dirPath: string): Promise<void> {
  const safePath = dirPath.replace(/'/g, "'\\''");
  const iTermScript = `
tell application "iTerm2"
    activate
    set newWindow to (create window with default profile)
    tell current session of newWindow
        write text "cd '${safePath}' && claude"
    end tell
end tell`;

  const terminalScript = `
tell application "Terminal"
    activate
    do script "cd '${safePath}' && claude"
end tell`;

  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", iTermScript], (err) => {
      if (!err) {
        resolve();
        return;
      }
      execFile("osascript", ["-e", terminalScript], (err2) => {
        if (err2) reject(err2);
        else resolve();
      });
    });
  });
}
