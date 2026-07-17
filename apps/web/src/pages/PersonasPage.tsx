import { useState } from 'react';
import { api, type Persona } from '../api';
import { StatusBadge, useLoad } from '../components/util';

/** Build-spec §5 Screen 1 — persona list / create. Disclosure is required. */
export function PersonasPage() {
  const { data: personas, error, loading, reload } = useLoad(() => api.get<Persona[]>('/personas'));
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <div className="page-head">
        <h1>Personas</h1>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : '+ New Persona'}</button>
      </div>
      {error && <div className="errbox">{error}</div>}
      {showForm && (
        <PersonaForm
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}
      {loading && <p className="muted">Loading…</p>}
      <div className="grid">
        {personas?.map((persona) => (
          <div className="card" key={persona.id}>
            <div className="row">
              <span className="card-title">🤖 {persona.name}</span>
              <StatusBadge status={persona.status} />
            </div>
            <div className="muted small">{persona.personaType}</div>
            <p className="small">{persona.description || <span className="muted">No description</span>}</p>
            <div className="small muted">
              {persona.campaigns?.filter((c) => c.status === 'ACTIVE').length ?? 0} active campaign(s) ·{' '}
              {persona.platformAccounts?.length ?? 0} platform account(s)
            </div>
            <div className="small note">Disclosure: “{persona.disclosureText}”</div>
          </div>
        ))}
      </div>
      {personas?.length === 0 && !loading && (
        <p className="muted">No personas yet. Create one — the disclosure text is mandatory and shown on every channel.</p>
      )}
    </>
  );
}

function PersonaForm({ onCreated }: { onCreated: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    personaType: 'VIRTUAL_INFLUENCER',
    description: '',
    backstory: '',
    tone: '',
    speakingStyle: '',
    humorStyle: '',
    disclosureText: 'Virtual AI-driven character.',
  });
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/personas', form);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack" onSubmit={submit}>
      {error && <div className="errbox">{error}</div>}
      <div className="row">
        <label className="field" style={{ flex: 2 }}>
          Name
          <input required value={form.name} onChange={set('name')} placeholder="Professor Steve" />
        </label>
        <label className="field" style={{ flex: 1 }}>
          Type
          <select value={form.personaType} onChange={set('personaType')}>
            {['VIRTUAL_INFLUENCER', 'PROFESSOR', 'EXPERT', 'BRAND_MASCOT', 'CARTOON', 'FACELESS_CHANNEL', 'CUSTOM'].map(
              (t) => (
                <option key={t}>{t}</option>
              ),
            )}
          </select>
        </label>
      </div>
      <label className="field">
        Description
        <input value={form.description} onChange={set('description')} />
      </label>
      <label className="field">
        Backstory / personality
        <textarea value={form.backstory} onChange={set('backstory')} />
      </label>
      <div className="row">
        <label className="field" style={{ flex: 1 }}>
          Tone
          <input value={form.tone} onChange={set('tone')} placeholder="warm, blunt, amused" />
        </label>
        <label className="field" style={{ flex: 1 }}>
          Speaking style
          <input value={form.speakingStyle} onChange={set('speakingStyle')} placeholder="short sentences, dry jokes" />
        </label>
        <label className="field" style={{ flex: 1 }}>
          Humor
          <input value={form.humorStyle} onChange={set('humorStyle')} />
        </label>
      </div>
      <label className="field">
        Disclosure text (required — shown on every channel; the persona is openly AI)
        <input required value={form.disclosureText} onChange={set('disclosureText')} />
      </label>
      <div>
        <button disabled={busy}>Create persona</button>
      </div>
    </form>
  );
}
