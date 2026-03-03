'use client';

import { FormEvent, KeyboardEvent } from 'react';
import { RefinementMessage, RefinementMode, RefinementScope, TargetedScope } from '@/lib/passprep/refinement';

type RefinementPanelProps = {
  messages: RefinementMessage[];
  pendingInstruction: string;
  refinementScope: RefinementScope;
  isRefining: boolean;
  error: string | null;
  onInstructionChange: (value: string) => void;
  onScopeChange: (next: RefinementScope) => void;
  onSubmit: () => void;
};

export function RefinementPanel({
  messages,
  pendingInstruction,
  refinementScope,
  isRefining,
  error,
  onInstructionChange,
  onScopeChange,
  onSubmit
}: RefinementPanelProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  const timestampFormatter = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <aside className="refinement-panel card" aria-label="Refinement panel">
      <div className="refinement-header">
        <h2>Refinement Panel</h2>
        <p className="helper">Iteratively adjust generated content without leaving your current workflow step.</p>
      </div>

      <div className="refinement-messages" role="log" aria-live="polite">
        {messages.length === 0 ? <p className="helper">No refinement activity yet.</p> : null}
        {messages.map((message) => (
          <article key={message.id} className={`refinement-message ${message.role}`}>
            <p>{message.text}</p>
            <time dateTime={message.timestamp}>{timestampFormatter.format(new Date(message.timestamp))}</time>
          </article>
        ))}
      </div>

      <form className="refinement-controls" onSubmit={handleSubmit}>
        <label>
          Mode
          <select
            value={refinementScope.mode}
            onChange={(event) =>
              onScopeChange({ ...refinementScope, mode: event.target.value as RefinementMode, target: 'all' })
            }
          >
            <option value="global">global</option>
            <option value="targeted">targeted</option>
          </select>
        </label>

        {refinementScope.mode === 'targeted' ? (
          <>
            <label>
              Scope
              <select
                value={refinementScope.target}
                onChange={(event) => onScopeChange({ ...refinementScope, target: event.target.value as TargetedScope })}
              >
                <option value="all">all</option>
                <option value="categoryId">categoryId</option>
                <option value="videoIds">videoIds</option>
                <option value="descriptions-only">descriptions-only</option>
                <option value="titles-only">titles-only</option>
              </select>
            </label>

            {refinementScope.target === 'categoryId' ? (
              <label>
                Category ID
                <input
                  type="text"
                  value={refinementScope.categoryId}
                  onChange={(event) => onScopeChange({ ...refinementScope, categoryId: event.target.value })}
                  placeholder="module id"
                />
              </label>
            ) : null}

            {refinementScope.target === 'videoIds' ? (
              <label>
                Video IDs (comma-separated)
                <input
                  type="text"
                  value={refinementScope.videoIds}
                  onChange={(event) => onScopeChange({ ...refinementScope, videoIds: event.target.value })}
                  placeholder="vid-1,vid-2"
                />
              </label>
            ) : null}
          </>
        ) : null}

        <label>
          Instruction
          <textarea
            value={pendingInstruction}
            rows={3}
            onKeyDown={handleTextareaKeyDown}
            onChange={(event) => onInstructionChange(event.target.value)}
            placeholder="Describe what should be refined. Press Enter to submit, Shift+Enter for newline."
          />
        </label>

        {error ? <p className="error">{error}</p> : null}

        <div className="actions end">
          <button type="submit" className="btn primary" disabled={isRefining || !pendingInstruction.trim()}>
            {isRefining ? 'Refining…' : 'Submit refinement'}
          </button>
        </div>
      </form>
    </aside>
  );
}
