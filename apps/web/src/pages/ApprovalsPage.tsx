import { useState } from 'react';
import { api, type ContentItem } from '../api';
import { RiskBadge, StatusBadge, useLoad } from '../components/util';

/** Build-spec §5 Screen 3 — the core screen. Nothing publishes until Approved. */
export function ApprovalsPage() {
  const { data: items, error, loading, reload } = useLoad(() => api.get<ContentItem[]>('/approvals'));

  return (
    <>
      <div className="page-head">
        <h1>Approval Queue {items ? `(${items.length})` : ''}</h1>
        <button className="secondary" onClick={reload}>
          Refresh
        </button>
      </div>
      <p className="note">Nothing here publishes until Approved. Guardrail blockers must be edited away first.</p>
      {error && <div className="errbox">{error}</div>}
      {loading && <p className="muted">Loading…</p>}
      {items?.length === 0 && !loading && <p className="muted">Queue is clear. 🎉</p>}
      {items?.map((item) => <ApprovalCard key={item.id} item={item} onChanged={reload} />)}
    </>
  );
}

function ApprovalCard({ item, onChanged }: { item: ContentItem; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const guardrails = item.guardrailResult ?? null;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const preview = item.bodyText ?? item.script ?? item.caption ?? '';

  return (
    <div className="card">
      <div className="row">
        <span className="badge">{item.platform}</span>
        <span className="badge">{item.contentType.replaceAll('_', ' ')}</span>
        <RiskBadge level={guardrails?.riskLevel} />
        <StatusBadge status={item.status} />
        {guardrails &&
          (guardrails.passed ? (
            <span className="badge low">✅ guardrails</span>
          ) : (
            <span className="badge high">⛔ blocked</span>
          ))}
        <span className="muted small">
          {item.persona?.name} / {item.campaign?.name}
        </span>
      </div>
      {item.title && <div className="card-title" style={{ marginTop: 8 }}>{item.title}</div>}
      {item.hook && <div className="small">Hook: “{item.hook}”</div>}
      {preview && <pre className="body-preview">{preview}</pre>}
      {item.hashtags.length > 0 && <div className="small muted">{item.hashtags.join(' ')}</div>}
      {item.cta && <div className="small muted">CTA: {item.cta}</div>}
      {item.sourceCitations.length > 0 && (
        <div className="small">
          Sources:{' '}
          {item.sourceCitations.map((c, i) => (
            <span key={i} className="mono small">
              {c}{' '}
            </span>
          ))}
        </div>
      )}

      {guardrails && guardrails.blockers.length > 0 && (
        <div className="errbox">
          {guardrails.blockers.map((b, i) => (
            <div key={i}>⛔ {b}</div>
          ))}
        </div>
      )}
      {guardrails && guardrails.warnings.length > 0 && (
        <div className="warnbox">
          {guardrails.warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}
      {guardrails && (
        <button className="secondary small" style={{ marginTop: 8 }} onClick={() => setShowChecklist((v) => !v)}>
          {showChecklist ? 'Hide' : 'Show'} guardrail checklist
        </button>
      )}
      {showChecklist && guardrails && (
        <ul className="checklist">
          {guardrails.checklist.map((c, i) => (
            <li key={i} className={c.passed ? 'ok' : 'bad'}>
              {c.label}
              {c.detail ? <span className="muted"> — {c.detail}</span> : null}
            </li>
          ))}
        </ul>
      )}

      {error && <div className="errbox">{error}</div>}

      {editing ? (
        <EditForm
          item={item}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={(edits) => act(() => api.post(`/approvals/${item.id}/edit`, edits))}
        />
      ) : (
        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="approve"
            disabled={busy || (guardrails ? !guardrails.passed : false) || item.status !== 'PENDING_APPROVAL'}
            onClick={() => act(() => api.post(`/approvals/${item.id}/approve`, {}))}
          >
            Approve
          </button>
          <button className="secondary" disabled={busy} onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={() => {
              const reason = window.prompt('Rejection reason (becomes learning memory):');
              if (reason) act(() => api.post(`/approvals/${item.id}/reject`, { reason }));
            }}
          >
            Reject
          </button>
          {['REGENERATE', 'MAKE_FUNNIER', 'MAKE_SHORTER', 'MAKE_MORE_SUBTLE'].map((action) => (
            <button
              key={action}
              className="secondary"
              disabled={busy}
              onClick={() => act(() => api.post(`/approvals/${item.id}/regenerate`, { action }))}
            >
              {action.replaceAll('_', ' ').toLowerCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditForm({
  item,
  busy,
  onSave,
  onCancel,
}: {
  item: ContentItem;
  busy: boolean;
  onSave: (edits: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [hook, setHook] = useState(item.hook ?? '');
  const [body, setBody] = useState(item.bodyText ?? item.script ?? '');
  const [citations, setCitations] = useState(item.sourceCitations.join('\n'));
  const isScript = item.bodyText == null && item.script != null;

  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <label className="field">
        Hook
        <input value={hook} onChange={(e) => setHook(e.target.value)} />
      </label>
      <label className="field">
        {isScript ? 'Script' : 'Body'}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <label className="field">
        Source citations (one per line)
        <textarea value={citations} onChange={(e) => setCitations(e.target.value)} />
      </label>
      <div className="row">
        <button
          disabled={busy}
          onClick={() =>
            onSave({
              hook,
              ...(isScript ? { script: body } : { bodyText: body }),
              sourceCitations: citations.split('\n').map((c) => c.trim()).filter(Boolean),
            })
          }
        >
          Save (re-runs guardrails)
        </button>
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
