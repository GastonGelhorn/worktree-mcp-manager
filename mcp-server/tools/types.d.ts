/**
 * Shared types for MCP tool modules
 */
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: Record<string, unknown>;
        required: string[];
    };
}
export interface ToolResponse {
    content: Array<{
        type: string;
        text: string;
    }>;
    isError?: boolean;
}
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResponse>;
export interface ToolModule {
    definitions: ToolDefinition[];
    handlers: Record<string, ToolHandler>;
}
//# sourceMappingURL=types.d.ts.map