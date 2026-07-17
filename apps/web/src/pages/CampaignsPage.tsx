import { Link } from 'react-router-dom';
import { api, type Campaign } from '../api';
import { StatusBadge, useLoad } from '../components/util';

export function CampaignsPage() {
  const { data: campaigns, error, loading } = useLoad(() => api.get<Campaign[]>('/campaigns'));

  return (
    <>
      <div className="page-head">
        <h1>Campaigns</h1>
        <Link to="/campaigns/new">
          <button>+ New Campaign</button>
        </Link>
      </div>
      {error && <div className="errbox">{error}</div>}
      {loading && <p className="muted">Loading…</p>}
      <div className="grid">
        {campaigns?.map((campaign) => (
          <Link to={`/campaigns/${campaign.id}`} key={campaign.id}>
            <div className="card">
              <div className="row">
                <span className="card-title">{campaign.name}</span>
                <StatusBadge status={campaign.status} />
              </div>
              <div className="muted small">
                {campaign.campaignType} · {campaign.persona?.name ?? 'unknown persona'}
              </div>
              <p className="small">{campaign.objective || <span className="muted">No objective</span>}</p>
              <div className="small muted">
                optimize: {campaign.optimizationTarget.toLowerCase()} · {campaign.schedules?.length ?? 0} schedule(s) ·{' '}
                {campaign._count?.generatedContent ?? 0} item(s) generated
              </div>
            </div>
          </Link>
        ))}
      </div>
      {campaigns?.length === 0 && !loading && (
        <p className="muted">
          No campaigns yet. A campaign is a disposable mission attached to one durable persona.
        </p>
      )}
    </>
  );
}
