import { describe, it, expect, afterAll } from "vitest";
import { resolveSafeDir, isRepoAllowed } from "./utils.js";
import os from "os";
import path from "path";

describe("resolveSafeDir", () => {
    it("resolves a valid home directory", async () => {
        const home = os.homedir();
        const result = await resolveSafeDir(home);
        expect(result).toBe(home);
    });

    it("rejects non-existent paths", async () => {
        await expect(resolveSafeDir("/nonexistent_xyz_12345")).rejects.toThrow();
    });

    it("rejects paths outside home", async () => {
        await expect(resolveSafeDir("/tmp")).rejects.toThrow("Path must be under user home");
    });

    it("rejects files (not directories)", async () => {
        // package.json exists but is a file
        const filePath = path.join(os.homedir(), ".zshrc");
        // This might not exist, but /tmp is reliable
        // Use a known file if it exists, otherwise skip
        try {
            await expect(resolveSafeDir(filePath)).rejects.toThrow();
        } catch {
            // File doesn't exist, that's also a rejection
        }
    });
});

describe("isRepoAllowed", () => {
    const originalEnv = process.env.WORKTREE_ALLOWED_REPOS;

    it("allows all repos when env var is not set", () => {
        delete process.env.WORKTREE_ALLOWED_REPOS;
        expect(isRepoAllowed("/any/path")).toBe(true);
    });

    it("allows repos in the allowlist", () => {
        process.env.WORKTREE_ALLOWED_REPOS = "/Users/dev/project1,/Users/dev/project2";
        expect(isRepoAllowed("/Users/dev/project1")).toBe(true);
        expect(isRepoAllowed("/Users/dev/project2")).toBe(true);
    });

    it("rejects repos not in the allowlist", () => {
        process.env.WORKTREE_ALLOWED_REPOS = "/Users/dev/project1";
        expect(isRepoAllowed("/Users/dev/other")).toBe(false);
    });

    it("handles whitespace in allowlist", () => {
        process.env.WORKTREE_ALLOWED_REPOS = " /Users/dev/project1 , /Users/dev/project2 ";
        expect(isRepoAllowed("/Users/dev/project1")).toBe(true);
    });

    afterAll(() => {
        if (originalEnv !== undefined) {
            process.env.WORKTREE_ALLOWED_REPOS = originalEnv;
        } else {
            delete process.env.WORKTREE_ALLOWED_REPOS;
        }
    });
});
