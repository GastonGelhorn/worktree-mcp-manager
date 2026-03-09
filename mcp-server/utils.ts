import path from "path";
import os from "os";
import fs from "fs/promises";
import { statSync } from "fs";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// CLI binary resolution
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findCliBin(): string {
    // 1. Env var override
    if (process.env.WORKTREE_CLI_PATH) return process.env.WORKTREE_CLI_PATH;

    // 2. Same directory as this script (bundled alongside)
    const sameDirBin = path.join(__dirname, "worktree-cli");
    // 3. Tauri sidecar location
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    const sidecarBin = path.join(__dirname, "..", "src-tauri", "bin", `worktree-cli-${arch}-apple-darwin`);
    // 4. Workspace target (dev mode)
    const devBin = path.join(__dirname, "..", "target", "release", "worktree-cli");
    const devDebugBin = path.join(__dirname, "..", "target", "debug", "worktree-cli");
    // 5. Common install locations
    const homeLocalBin = path.join(os.homedir(), ".local", "bin", "worktree-cli");
    const usrLocalBin = "/usr/local/bin/worktree-cli";

    for (const candidate of [sameDirBin, sidecarBin, devBin, devDebugBin, homeLocalBin, usrLocalBin]) {
        try {
            const stat = statSync(candidate);
            if (stat.isFile()) return candidate;
        } catch { /* not found */ }
    }

    // Fallback: assume it's in PATH
    return "worktree-cli";
}

/** Resolved path to the worktree-cli binary. Cached at module load. */
export const CLI_BIN = findCliBin();

export async function resolveSafeDir(rawPath: string): Promise<string> {
    const resolved = path.resolve(rawPath);
    const realPath = await fs.realpath(resolved);
    const stat = await fs.stat(realPath);
    if (!stat.isDirectory()) throw new Error(`Path is not a directory: ${realPath}`);
    const home = os.homedir();
    if (!realPath.startsWith(home + path.sep) && realPath !== home) {
        throw new Error(`Path must be under user home: ${realPath}`);
    }
    return realPath;
}

export function isRepoAllowed(repoPath: string): boolean {
    const allowed = process.env.WORKTREE_ALLOWED_REPOS;
    if (!allowed) return true;
    const list = allowed.split(",").map((p) => p.trim());
    const resolved = path.resolve(repoPath);
    return list.some((a) => resolved.startsWith(path.resolve(a)));
}
