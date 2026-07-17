import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Campaign, type Persona } from '../api';
import { useLoad } from '../components/util';

const TYPES = [
  { value: 'PRODUCT_HYPE', label: 'Product' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'DEBUNK', label: 'Debunk' },
  { value: 'CIVIC_MECHANICS', label: 'Civic' },
] as const;

const MISSION_TYPES = new Set(['DEBUNK', 'CIVIC_MECHANICS']);

/** Build-spec §5 Screen 2 — campaign create. Optimize-for locks for Debunk. */
export function NewCampaignPage() {
  const navigate = useNavigate();
  const { data: personas } = useLoad(() => api.get<Persona[]>('/personas'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    personaId: '',
    name: '',
    campaignType: 'PRODUCT_HYPE' as string,
    objective: '',
    subject: '',
    productName: '',
    productUrl: '',
    optimizationTarget: 'REACH',
    directnessLevel: 'CASUAL',
  });
  const [platforms, setPlatforms] = useState({ youtube: true, x: true, instagram: false });

  const isMission = MISSION_TYPES.has(form.campaignType);
  const targets = useMemo(
    () => (isMission ? ['CLARITY', 'COMPLETION'] : ['REACH', 'ENGAGEMENT', 'CLICKS']),
    [isMission],
  );
  const effectiveTarget = targets.includes(form.optimizationTarget)
    ? form.optimizationTarget
    : targets[0]!;

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const campaign = await api.post<Campaign>('/campaigns', {
        personaId: form.personaId,
        name: form.name,
        campaignType: form.campaignType,
        objective: form.objective,
        subject: form.subject || undefined,
        productName: form.productName || undefined,
        productUrl: form.productUrl || undefined,
        optimizationTarget: effectiveTarget,
        directnessLevel: form.directnessLevel,
      });
      // DEBUNK topics are human-picked per item (§7.1) — no auto schedules.
      if (form.campaignType !== 'DEBUNK') {
        if (platforms.youtube) {
          await api.post(`/campaigns/${campaign.id}/schedules`, {
            platform: 'YOUTUBE',
            contentType: 'SHORT_VIDEO',
            cadenceType: 'CRON',
            cronExpression: '0 19 * * *',
          });
        }
        if (platforms.x) {
          await api.post(`/campaigns/${campaign.id}/schedules`, {
            platform: 'X',
            contentType: 'TEXT_POST',
            cadenceType: 'INTERVAL',
            intervalMinutes: 720,
          });
        }
      }
      navigate(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>New Campaign</h1>
      </div>
      <form className="card stack" onSubmit={submit} style={{ maxWidth: 640 }}>
        {error && <div className="errbox">{error}</div>}
        <label className="field">
          Persona
          <select required value={form.personaId} onChange={set('personaId')}>
            <option value="">Select persona…</option>
            {personas?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Campaign name
          <input required value={form.name} onChange={set('name')} placeholder="GuidedGenius Launch" />
        </label>
        <label className="field">
          Goal
          <input
            required
            value={form.objective}
            onChange={set('objective')}
            placeholder="get people hyped on X app"
          />
        </label>
        <fieldset>
          <legend>Type</legend>
          <div className="row" style={{ padding: '6px 8px' }}>
            {TYPES.map((t) => (
              <label key={t.value} className="row" style={{ gap: 4 }}>
                <input
                  type="radio"
                  name="type"
                  checked={form.campaignType === t.value}
                  onChange={() => setForm((f) => ({ ...f, campaignType: t.value }))}
                />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>
        {form.campaignType === 'DEBUNK' && (
          <div className="warnbox">
            Debunk campaigns: no advocacy — content ends at “is this claim accurate?”. Every debunk
            topic is picked by a human per item (no automated schedules), and every item needs a
            primary-source citation before it can be approved.
          </div>
        )}
        <label className="field">
          Subject (coordination key — two personas cannot run the same subject at once)
          <input value={form.subject} onChange={set('subject')} placeholder="GuidedGenius" />
        </label>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            Product name (optional)
            <input value={form.productName} onChange={set('productName')} />
          </label>
          <label className="field" style={{ flex: 1 }}>
            Product URL (optional)
            <input value={form.productUrl} onChange={set('productUrl')} />
          </label>
        </div>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            Optimize for {isMission && <span className="note">(locked to mission metrics for Debunk/Civic)</span>}
            <select value={effectiveTarget} onChange={set('optimizationTarget')}>
              {targets.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            Directness
            <select value={form.directnessLevel} onChange={set('directnessLevel')}>
              {['VERY_SUBTLE', 'SUBTLE', 'CASUAL', 'DIRECT', 'HARD_CTA'].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Platforms</legend>
          <div className="row" style={{ padding: '6px 8px' }}>
            <label className="row" style={{ gap: 4 }}>
              <input
                type="checkbox"
                checked={platforms.youtube}
                onChange={(e) => setPlatforms((p) => ({ ...p, youtube: e.target.checked }))}
              />
              YouTube Shorts (daily video)
            </label>
            <label className="row" style={{ gap: 4 }}>
              <input
                type="checkbox"
                checked={platforms.x}
                onChange={(e) => setPlatforms((p) => ({ ...p, x: e.target.checked }))}
              />
              X (2 posts/day)
            </label>
            <span className="note">IG/TikTok: manual export at publish time</span>
          </div>
        </fieldset>
        <div>
          <button disabled={busy}>Create campaign</button>
        </div>
      </form>
    </>
  );
}
