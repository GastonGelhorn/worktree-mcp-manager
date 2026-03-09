import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/app-store';
import * as cmd from '../../lib/tauri-commands-new';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Button } from '../ui/Button';
import { RefreshCw, CheckCircle2, AlertCircle, Loader2, Plus, Trash2, Pencil, X, ChevronDown, ChevronRight, Play } from 'lucide-react';
import type { WorkflowDef, WorkflowResult, WorkflowStep } from '../../types/new-types';

const AVAILABLE_TOOLS = ['git', 'test', 'lint', 'format', 'build', 'deploy', 'push', 'pull'];


interface WorkflowPanelProps {
  repoPath: string;
}

export function WorkflowPanel({ repoPath }: WorkflowPanelProps) {
  const addToast = useAppStore(s => s.addToast);
  const [workflows, setWorkflows] = useState<WorkflowDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDef | null>(null);
  const [executionResults, setExecutionResults] = useState<Record<string, WorkflowResult>>({});
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowDef | null>(null);
  const [formName, setFormName] = useState('');
  const [formConfirmation, setFormConfirmation] = useState(false);
  const [formSteps, setFormSteps] = useState<WorkflowStep[]>([{ tool: 'git', params: {}, description: '' }]);

  const loadWorkflows = async () => {
    setLoading(true);
    try {
      const result = await cmd.listWorkflows(repoPath);
      setWorkflows(result || []);
    } catch (e: any) {
      addToast('error', 'Failed to load workflows', e.toString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflows();
  }, [repoPath]);

  const toggleExpanded = (name: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleRunClick = (workflow: WorkflowDef) => {
    if (workflow.requires_confirmation) {
      setSelectedWorkflow(workflow);
      setConfirmOpen(true);
    } else {
      handleExecuteWorkflow(workflow);
    }
  };

  const handleExecuteWorkflow = async (workflow: WorkflowDef) => {
    setExecuting(workflow.name);
    setExpandedCards(prev => new Set(prev).add(workflow.name));
    try {
      const result = await cmd.executeWorkflow(repoPath, workflow.name);
      setExecutionResults(prev => ({ ...prev, [workflow.name]: result }));
      if (result.success) {
        addToast('success', `Workflow "${workflow.name}" completed`, `${result.steps_completed}/${result.total_steps} steps completed`);
      } else {
        addToast('error', `Workflow "${workflow.name}" failed`, `${result.steps_completed}/${result.total_steps} steps completed`);
      }
    } catch (e: any) {
      addToast('error', `Failed to execute workflow "${workflow.name}"`, e.toString());
    } finally {
      setExecuting(null);
    }
  };

  const handleDeleteClick = (workflow: WorkflowDef) => {
    setSelectedWorkflow(workflow);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteWorkflow = async () => {
    if (!selectedWorkflow) return;
    try {
      await cmd.deleteWorkflow(selectedWorkflow.name);
      addToast('success', 'Workflow deleted', selectedWorkflow.name);
      loadWorkflows();
    } catch (e: any) {
      addToast('error', 'Failed to delete workflow', e.toString());
    }
  };

  const handleEditClick = (workflow: WorkflowDef) => {
    setEditingWorkflow(workflow);
    setFormName(workflow.name);
    setFormConfirmation(workflow.requires_confirmation);
    setFormSteps(workflow.steps.length > 0 ? workflow.steps : [{ tool: 'git', params: {}, description: '' }]);
    setShowForm(true);
  };

  const handleNewWorkflow = () => {
    setEditingWorkflow(null);
    setFormName('');
    setFormConfirmation(false);
    setFormSteps([{ tool: 'git', params: {}, description: '' }]);
    setShowForm(true);
  };

  const handleSaveWorkflow = async () => {
    const name = formName.trim();
    if (!name) {
      addToast('error', 'Name is required', '');
      return;
    }
    const validSteps = formSteps.filter(s => s.description.trim());
    if (validSteps.length === 0) {
      addToast('error', 'At least one step with a description is required', '');
      return;
    }

    const workflow: WorkflowDef = {
      name,
      requires_confirmation: formConfirmation,
      steps: validSteps.map(s => ({ ...s, description: s.description.trim() })),
    };

    try {
      await cmd.saveWorkflow(workflow);
      addToast('success', editingWorkflow ? 'Workflow updated' : 'Workflow created', name);
      setShowForm(false);
      loadWorkflows();
    } catch (e: any) {
      addToast('error', 'Failed to save workflow', e.toString());
    }
  };

  const addStep = () => {
    setFormSteps(prev => [...prev, { tool: 'git', params: {}, description: '' }]);
  };

  const removeStep = (index: number) => {
    setFormSteps(prev => prev.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, field: keyof WorkflowStep, value: string) => {
    setFormSteps(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };


  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white/80">Workflows</h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadWorkflows} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="primary" size="sm" onClick={handleNewWorkflow}>
              <Plus className="w-3.5 h-3.5" />
              New Workflow
            </Button>
          </div>
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-white/90">
                {editingWorkflow ? `Edit: ${editingWorkflow.name}` : 'New Workflow'}
              </h4>
              <button onClick={() => setShowForm(false)} className="text-white/30 hover:text-white/60">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs text-white/50 mb-1">Name</label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                disabled={!!editingWorkflow}
                placeholder="my_workflow"
                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white/90 placeholder-white/20 focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={formConfirmation}
                onChange={e => setFormConfirmation(e.target.checked)}
                className="rounded border-white/20"
              />
              Require confirmation before running
            </label>

            <div>
              <label className="block text-xs text-white/50 mb-2">Steps</label>
              <div className="space-y-2">
                {formSteps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-[10px] text-white/30 w-4 text-right shrink-0">{idx + 1}</span>
                    <select
                      value={step.tool}
                      onChange={e => updateStep(idx, 'tool', e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:border-indigo-500/50"
                    >
                      {AVAILABLE_TOOLS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      type="text"
                      value={step.description}
                      onChange={e => updateStep(idx, 'description', e.target.value)}
                      placeholder="Step description"
                      className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white/80 placeholder-white/20 focus:outline-none focus:border-indigo-500/50"
                    />
                    {formSteps.length > 1 && (
                      <button onClick={() => removeStep(idx)} className="text-white/20 hover:text-red-400 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={addStep}
                className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                + Add step
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleSaveWorkflow}>Save</Button>
            </div>
          </div>
        )}

        {/* Workflow List */}
        <div className="space-y-2">
          {workflows.map((workflow) => {
            const result = executionResults[workflow.name];
            const isExecuting = executing === workflow.name;
            const expanded = expandedCards.has(workflow.name);

            return (
              <div
                key={workflow.name}
                className={`rounded-lg border p-3 transition-colors ${
                  result
                    ? result.success
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : 'bg-red-500/5 border-red-500/20'
                    : 'bg-white/2 border-white/5 hover:bg-white/3'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        onClick={() => toggleExpanded(workflow.name)}
                        className="text-white/40 hover:text-white/70 transition-colors"
                      >
                        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      <h4 className="text-sm font-medium text-white/90">{workflow.name}</h4>
                      {workflow.requires_confirmation && (
                        <span className="text-[9px] bg-amber-500/15 text-amber-400/80 px-1.5 py-0.5 rounded font-medium">
                          Requires Confirmation
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/40 pl-6">
                      {workflow.steps.length} step{workflow.steps.length !== 1 ? 's' : ''}
                      {!expanded && workflow.steps.length > 0 && (
                        <span className="text-white/25"> — {workflow.steps.map(s => s.description).join(' → ')}</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleEditClick(workflow)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(workflow)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleRunClick(workflow)}
                      disabled={isExecuting || loading}
                    >
                      {isExecuting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3" />
                          Run
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Expanded: Steps list */}
                {expanded && (
                  <div className="mt-3 pl-6 space-y-1 border-t border-white/5 pt-3">
                    {workflow.steps.map((step, stepIdx) => {
                      const stepResult = result?.results[stepIdx];
                      return (
                        <div key={stepIdx} className="flex items-center gap-2 text-xs">
                          {stepResult ? (
                            stepResult.success ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                            ) : (
                              <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                            )
                          ) : (
                            <span className="w-3 h-3 flex items-center justify-center text-[9px] text-white/30 shrink-0">{stepIdx + 1}</span>
                          )}
                          <span className="text-white/30 font-mono text-[10px] w-10 shrink-0">{step.tool}</span>
                          <span className={
                            stepResult
                              ? stepResult.success ? 'text-emerald-400/70' : 'text-red-400/70'
                              : 'text-white/50'
                          }>
                            {step.description}
                          </span>
                        </div>
                      );
                    })}

                    {result && (
                      <div className="mt-2 pt-2 border-t border-white/5">
                        <span className={`text-xs font-medium ${result.success ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                          {result.success ? 'Completed' : 'Failed'}: {result.steps_completed}/{result.total_steps} steps
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {workflows.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-12 rounded-lg border border-white/5 bg-white/2">
              <p className="text-sm text-white/40 mb-3">No workflows available</p>
              <Button variant="primary" size="sm" onClick={handleNewWorkflow}>
                <Plus className="w-3.5 h-3.5" />
                Create Workflow
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Run Confirmation Dialog */}
      {selectedWorkflow && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Run Workflow: ${selectedWorkflow.name}`}
          description={
            <div className="space-y-2">
              <p>This workflow requires confirmation before execution.</p>
              <div className="mt-2 space-y-1 text-xs text-white/40">
                {selectedWorkflow.steps.map((step, i) => (
                  <div key={i}>{i + 1}. [{step.tool}] {step.description}</div>
                ))}
              </div>
            </div>
          }
          confirmLabel="Execute"
          variant="default"
          onConfirm={() => {
            if (selectedWorkflow) handleExecuteWorkflow(selectedWorkflow);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {selectedWorkflow && (
        <ConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title={`Delete Workflow: ${selectedWorkflow.name}`}
          description={<p>This will permanently delete this workflow.</p>}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDeleteWorkflow}
        />
      )}
    </>
  );
}
