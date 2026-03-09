export interface WorktreeTemplate {
  id: string;
  name: string;
  description?: string;
  branchPrefix?: string;
  herdLink: boolean;
  dbStrategy: 'shared' | 'isolated';
  assignVitePort: boolean;
  injectClaudeContext: boolean;
}
