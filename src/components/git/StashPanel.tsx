import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/app-store';
import * as cmd from '../../lib/tauri-commands';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { RefreshCw, Trash2, Check, Plus, Loader2, AlertCircle } from 'lucide-react';
import type { StashEntry } from '../../types';

interface StashPanelProps {
  repoPath: string;
}

export function StashPanel({ repoPath }: StashPanelProps) {
  const addToast = useAppStore(s => s.addToast);
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [stashMessage, setStashMessage] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedStash, setSelectedStash] = useState<StashEntry | null>(null);
  const [confirmAction, setConfirmAction] = useState<'apply' | 'drop' | null>(null);

  const loadStashes = async () => {
    setLoading(true);
    try {
      const result = await cmd.listStashes(repoPath);
      setStashes(result || []);
    } catch (e: any) {
      addToast('error', 'Failed to load stashes', e.toString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStashes();
  }, [repoPath]);

  const handleCreateStash = async () => {
    if (!stashMessage.trim()) {
      addToast('warning', 'Empty stash message', 'Please enter a message for the stash');
      return;
    }

    setCreating(true);
    try {
      await cmd.gitStash(repoPath, stashMessage);
      addToast('success', 'Stash created', stashMessage);
      setStashMessage('');
      loadStashes();
    } catch (e: any) {
      addToast('error', 'Failed to create stash', e.toString());
    } finally {
      setCreating(false);
    }
  };

  const handleApplyStash = async (stash: StashEntry) => {
    try {
      await cmd.gitStashPop(repoPath, stash.index);
      addToast('success', 'Stash applied', stash.message);
      loadStashes();
    } catch (e: any) {
      addToast('error', 'Failed to apply stash', e.toString());
    }
  };

  const handleDropStash = async (stash: StashEntry) => {
    try {
      await cmd.gitStashDrop(repoPath, stash.index);
      addToast('success', 'Stash dropped', stash.message);
      loadStashes();
    } catch (e: any) {
      addToast('error', 'Failed to drop stash', e.toString());
    }
  };

  const handleActionClick = (stash: StashEntry, action: 'apply' | 'drop') => {
    setSelectedStash(stash);
    setConfirmAction(action);
    setConfirmOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!selectedStash || !confirmAction) return;

    if (confirmAction === 'apply') {
      await handleApplyStash(selectedStash);
    } else {
      await handleDropStash(selectedStash);
    }

    setConfirmOpen(false);
    setSelectedStash(null);
    setConfirmAction(null);
  };

  return (
    <>
      <div className="space-y-4">
        {/* Create Stash Section */}
        <div className="rounded-lg border border-white/5 bg-white/2 p-3">
          <h3 className="text-sm font-medium text-white/80 mb-3">Create New Stash</h3>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Stash message (e.g., WIP: feature branch)"
              value={stashMessage}
              onChange={e => setStashMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateStash()}
              disabled={creating}
              className="flex-1"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateStash}
              disabled={creating || !stashMessage.trim()}
            >
              {creating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Create
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Stashes List */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-white/80">
            Stashes {stashes.length > 0 && <span className="text-white/40">({stashes.length})</span>}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadStashes}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {stashes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 rounded-lg border border-white/5 bg-white/2">
            <AlertCircle className="w-10 h-10 text-white/20 mb-2" />
            <p className="text-sm text-white/50 text-center mb-1">No stashes yet</p>
            <p className="text-xs text-white/30 text-center max-w-sm">
              Stashes let you save uncommitted changes temporarily without committing them.
              Useful when you need to switch branches quickly. Type a message above and click Create to stash your current changes.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {stashes.map((stash, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-white/5 bg-white/2 p-3 hover:bg-white/3 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-mono bg-white/10 text-white/70 px-1.5 py-0.5 rounded">
                        {`stash@{${stash.index}}`}
                      </span>
                      <h4 className="text-sm font-medium text-white/90 truncate">
                        {stash.message}
                      </h4>
                    </div>
                    {stash.branch && (
                      <p className="text-xs text-white/40">
                        Branch: <span className="font-mono">{stash.branch}</span>
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleActionClick(stash, 'apply')}
                      title="Apply stash"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Apply
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleActionClick(stash, 'drop')}
                      title="Drop stash"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      {selectedStash && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={confirmAction === 'apply' ? 'Apply Stash' : 'Drop Stash'}
          description={
            <div className="space-y-2">
              <p>
                {confirmAction === 'apply'
                  ? 'Apply the stashed changes to your working directory?'
                  : 'Delete this stash permanently?'}
              </p>
              <p className="text-white/40 font-mono text-xs">
                {`stash@{${selectedStash.index}}`}: {selectedStash.message}
              </p>
            </div>
          }
          confirmLabel={confirmAction === 'apply' ? 'Apply' : 'Drop'}
          variant={confirmAction === 'drop' ? 'danger' : 'default'}
          onConfirm={handleConfirmAction}
        />
      )}
    </>
  );
}
