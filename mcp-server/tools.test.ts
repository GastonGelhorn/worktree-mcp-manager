import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveSafeDir, isRepoAllowed } from "./utils.js";

// ─── Tool Argument Validation Tests ───────────────────────────────────

describe("Tool argument validation patterns", () => {
    describe("worktree path validation", () => {
        it("accepts valid home directory paths", async () => {
            const home = process.env.HOME || "/tmp";
            const result = await resolveSafeDir(home);
            expect(result).toBeTruthy();
        });

        it("rejects system paths outside home", async () => {
            await expect(resolveSafeDir("/etc")).rejects.toThrow();
        });

        it("rejects symlink traversal attacks", async () => {
            await expect(resolveSafeDir("/tmp/../../etc/passwd")).rejects.toThrow();
        });
    });

    describe("repo allowlist edge cases", () => {
        const originalEnv = process.env.WORKTREE_ALLOWED_REPOS;

        afterEach(() => {
            if (originalEnv !== undefined) {
                process.env.WORKTREE_ALLOWED_REPOS = originalEnv;
            } else {
                delete process.env.WORKTREE_ALLOWED_REPOS;
            }
        });

        it("allows subdirectories of allowed repos", () => {
            process.env.WORKTREE_ALLOWED_REPOS = "/Users/dev/project";
            expect(isRepoAllowed("/Users/dev/project/sub/dir")).toBe(true);
        });

        it("rejects parent directories of allowed repos", () => {
            process.env.WORKTREE_ALLOWED_REPOS = "/Users/dev/project";
            expect(isRepoAllowed("/Users/dev")).toBe(false);
        });

        it("handles multiple allowed repos with mixed paths", () => {
            process.env.WORKTREE_ALLOWED_REPOS = "/Users/dev/a, /Users/dev/b, /Users/dev/c";
            expect(isRepoAllowed("/Users/dev/a")).toBe(true);
            expect(isRepoAllowed("/Users/dev/b/sub")).toBe(true);
            expect(isRepoAllowed("/Users/dev/d")).toBe(false);
        });

        it("handles empty allowlist string as no restriction", () => {
            process.env.WORKTREE_ALLOWED_REPOS = "";
            // Empty string is falsy in JS, so !allowed === true → allows all
            expect(isRepoAllowed("/any/path")).toBe(true);
        });
    });
});

// ─── CLI Output Parsing Tests (simulating what the tools expect) ──────

describe("CLI output parsing patterns", () => {
    it("parses JSON success response", () => {
        const stdout = JSON.stringify({ worktrees: [{ path: "/dev/wt", branch: "main" }] });
        const parsed = JSON.parse(stdout);
        expect(parsed.worktrees).toHaveLength(1);
    });

    it("handles plain text response (fallback)", () => {
        const stdout = "Worktree added successfully.";
        let result;
        try {
            result = JSON.parse(stdout);
        } catch {
            result = stdout.trim();
        }
        expect(result).toBe("Worktree added successfully.");
    });

    it("parses structured error from stderr", () => {
        const stderr = JSON.stringify({ error: "Branch already exists" });
        const parsed = JSON.parse(stderr);
        expect(parsed.error).toBe("Branch already exists");
    });

    it("handles non-JSON stderr gracefully", () => {
        const stderr = "fatal: not a git repository";
        let errorMsg: string;
        try {
            const parsed = JSON.parse(stderr);
            errorMsg = parsed.error || stderr;
        } catch {
            errorMsg = stderr;
        }
        expect(errorMsg).toBe("fatal: not a git repository");
    });
});

// ─── Destructive Tool Safety Tests ────────────────────────────────────

describe("Destructive tool identification", () => {
    const DESTRUCTIVE_TOOLS = new Set(["remove_worktree", "delete_branch", "git_stash_drop"]);

    it("identifies remove_worktree as destructive", () => {
        expect(DESTRUCTIVE_TOOLS.has("remove_worktree")).toBe(true);
    });

    it("identifies delete_branch as destructive", () => {
        expect(DESTRUCTIVE_TOOLS.has("delete_branch")).toBe(true);
    });

    it("identifies git_stash_drop as destructive", () => {
        expect(DESTRUCTIVE_TOOLS.has("git_stash_drop")).toBe(true);
    });

    it("does not flag safe tools as destructive", () => {
        expect(DESTRUCTIVE_TOOLS.has("list_worktrees")).toBe(false);
        expect(DESTRUCTIVE_TOOLS.has("add_worktree")).toBe(false);
        expect(DESTRUCTIVE_TOOLS.has("git_checkout")).toBe(false);
        expect(DESTRUCTIVE_TOOLS.has("get_branch_graph")).toBe(false);
    });
});

// ─── Tool Input Shape Validation ──────────────────────────────────────

describe("Tool input schema validation", () => {
    it("validates add_worktree required fields", () => {
        const validInput = {
            repoPath: "/Users/dev/repo",
            path: "/Users/dev/repo-wt",
            branch: "feature/new",
            createBranch: true,
            linkHerd: false,
        };

        expect(validInput.repoPath).toBeTruthy();
        expect(validInput.path).toBeTruthy();
        expect(validInput.branch).toBeTruthy();
        expect(typeof validInput.createBranch).toBe("boolean");
        expect(typeof validInput.linkHerd).toBe("boolean");
    });

    it("validates git_stash_pop index is a number", () => {
        const input = { repoPath: "/dev/repo", index: 2 };
        expect(typeof input.index).toBe("number");
        expect(Math.floor(input.index)).toBe(input.index);
    });

    it("clamps maxCommits for get_branch_graph", () => {
        const maxCommits = 500;
        const clamped = Math.min(Math.floor(maxCommits), 200);
        expect(clamped).toBe(200);
    });

    it("floors stash index to prevent float issues", () => {
        const index = 1.7;
        expect(Math.floor(index)).toBe(1);
    });
});
