import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Campaign, type ContentItem, type Insight, type PublishedPost } from '../api';
import { StatusBadge, useLoad } from '../components/util';

interface Analytics {
  totals: { views: number; likes: number; comments: number; shares: number };
  insights: Insight[];
}

/** Build-spec §5 Screen 4 — campaign dashboard. */
export function CampaignDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const campaignLoad = useLoad(() => api.get<Campaign>(`/campaigns/${id}`), [id]);
  const analyticsLoad = useLoad(() => api.get<Analytics>(`/campaigns/${id}/analytics`), [id]);
  const contentLoad = useLoad(
    () => api.get<ContentItem[]>(`/content?campaignId=${id}&take=100`),
    [id],
  );
  const publishedLoad = useLoad(() => api.get<PublishedPost[]>('/published'), [id]);

  const campaign = campaignLoad.data;
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [claim, setClaim] = useState('');

  if (campaignLoad.error) return <div className="errbox">{campaignLoad.error}</div>;
  if (!campaign) return <p className="muted">Loading…</p>;

  const pending = contentLoad.data?.filter((c) => c.status === 'PENDING_APPROVAL').length ?? 0;
  const published = contentLoad.data?.filter((c) => c.status === 'PUBLISHED').length ?? 0;
  const campaignPosts =
    publishedLoad.data?.filter((p) =>
      contentLoad.data?.some((c) => c.id === p.generatedContentId),
    ) ?? [];
  const isDebunk = campaign.campaignType === 'DEBUNK';

  const reloadAll = () => {
    contentLoad.reload();
    analyticsLoad.reload();
    publishedLoad.reload();
  };

  const generateNow = async () => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      if (isDebunk) {
        await api.post(`/generation/run/${campaign.id}`, {
          platform: 'X',
          contentType: 'TEXT_POST',
          claimToDebunk: claim,
        });
      } else {
        await api.post('/generation/run', { campaignId: campaign.id });
      }
      setOk('Generated — see the Approval Queue.');
      reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runInsights = async () => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const result = await api.post<{ insight: unknown; reason?: string }>(
        `/analytics/insights/${campaign.id}`,
      );
      setOk(result.insight ? 'New learning insight generated.' : (result.reason ?? 'No insight.'));
      analyticsLoad.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>
          {campaign.name} <span className="muted">· {campaign.persona?.name}</span>
        </h1>
        <StatusBadge status={campaign.status} />
      </div>
      <div className="row small muted" style={{ marginBottom: 12 }}>
        <span className="badge">{campaign.campaignType}</span>
        <span>optimize: {campaign.optimizationTarget.toLowerCase()}</span>
        {campaign.subject && <span>subject: {campaign.subject}</span>}
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="value">{published}</div>
          <div className="label">Published</div>
        </div>
        <div className="stat">
          <div className="value">{pending}</div>
          <div className="label">Pending approval</div>
        </div>
        <div className="stat">
          <div className="value">{analyticsLoad.data?.totals.views?.toLocaleString() ?? '—'}</div>
          <div className="label">Total views</div>
        </div>
        <div className="stat">
          <div className="value">{analyticsLoad.data?.insights.length ?? 0}</div>
          <div className="label">Learnings</div>
        </div>
      </div>

      {error && <div className="errbox">{error}</div>}
      {ok && <div className="okbox">{ok}</div>}

      <div className="card">
        <div className="card-title">Generate</div>
        {isDebunk ? (
          <div className="stack">
            <div className="note">
              Debunk topics are human-picked per item (§7.1). Enter the specific claim; the generated
              correction must cite a primary source and contain no advocacy.
            </div>
            <label className="field">
              Claim to debunk
              <input
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
                placeholder='e.g. "the viral clip shows the whole exchange"'
              />
            </label>
            <div>
              <button disabled={busy || claim.trim().length < 5} onClick={generateNow}>
                Generate debunk draft
              </button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button disabled={busy} onClick={generateNow}>
              Generate Now (all schedules)
            </button>
            <span className="note">Drafts land in the Approval Queue — nothing publishes on its own.</span>
          </div>
        )}
        {pending > 0 && (
          <p className="small" style={{ marginBottom: 0 }}>
            <Link to="/approvals">→ {pending} item(s) waiting in the Approval Queue</Link>
          </p>
        )}
      </div>

      <h2>Latest learnings</h2>
      {analyticsLoad.data?.insights.length ? (
        analyticsLoad.data.insights.slice(0, 3).map((insight) => (
          <div className="card" key={insight.id}>
            <div className="card-title small">Learn: “{insight.insight}”</div>
            <div className="small muted">{insight.actionRecommendation}</div>
            <div className="small muted">confidence {(insight.confidence * 100).toFixed(0)}%</div>
          </div>
        ))
      ) : (
        <p className="muted small">
          No learnings yet — publish at least 2 items and record their metrics, then{' '}
          <a onClick={runInsights} style={{ cursor: 'pointer' }}>
            run the learning loop
          </a>
          .
        </p>
      )}
      {analyticsLoad.data?.insights.length ? (
        <button className="secondary" disabled={busy} onClick={runInsights}>
          Re-run learning loop
        </button>
      ) : null}

      <h2>Published</h2>
      {campaignPosts.length === 0 && <p className="muted small">Nothing published yet.</p>}
      {campaignPosts.map((post) => (
        <PublishedRow key={post.id} post={post} onSaved={reloadAll} />
      ))}
    </>
  );
}

function PublishedRow({ post, onSaved }: { post: PublishedPost; onSaved: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({ views: 0, likes: 0, comments: 0, shares: 0, clicks: 0 });
  const snapshot = post.snapshots?.[0];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/published/${post.id}/metrics`, { ...metrics, saves: 0 });
      setShowForm(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="row">
        <span className="badge">{post.platform.replaceAll('_', ' ')}</span>
        <span className="small">{post.generatedContent?.hook ?? post.generatedContent?.title ?? post.platformPostId}</span>
      </div>
      <div className="row small muted" style={{ marginTop: 6 }}>
        {snapshot ? (
          <>
            <span>{snapshot.views.toLocaleString()} views</span>
            <span>{snapshot.engagementRate}% engagement</span>
            {snapshot.missionMetric != null && <span>mission {snapshot.missionMetric}</span>}
          </>
        ) : (
          <span>No metrics yet</span>
        )}
        {post.platform === 'MANUAL_EXPORT' && post.platformUrl && (
          <span className="mono">{post.platformUrl}</span>
        )}
        <button className="secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'Enter metrics'}
        </button>
      </div>
      {showForm && (
        <div className="row" style={{ marginTop: 8 }}>
          {(['views', 'likes', 'comments', 'shares', 'clicks'] as const).map((key) => (
            <label className="field" key={key} style={{ width: 90 }}>
              {key}
              <input
                type="number"
                min={0}
                value={metrics[key]}
                onChange={(e) => setMetrics((m) => ({ ...m, [key]: Number(e.target.value) }))}
              />
            </label>
          ))}
          <button disabled={busy} onClick={save}>
            Save
          </button>
        </div>
      )}
      {error && <div className="errbox">{error}</div>}
    </div>
  );
}
