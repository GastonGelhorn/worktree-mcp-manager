export interface IdeOpenResult {
    success: boolean;
    ide: string;
    message: string;
}
/**
 * Find the Cursor CLI binary path
 */
export declare function findCursorCli(): string;
/**
 * Open a directory in Cursor IDE
 */
export declare function openInCursor(dirPath: string): Promise<void>;
/**
 * Open a directory in VS Code
 */
export declare function openInVSCode(dirPath: string): Promise<void>;
/**
 * Open a directory in Claude Desktop app
 */
export declare function openInClaudeDesktop(dirPath: string): Promise<void>;
/**
 * Open a directory in macOS Terminal or iTerm via AppleScript
 * Tries iTerm2 first, falls back to Terminal
 */
export declare function openClaudeCLI(dirPath: string): Promise<void>;
//# sourceMappingURL=ide-utils.d.ts.map