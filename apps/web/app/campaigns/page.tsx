import { apiGet } from "@/lib/api";

interface Campaign {
  id: string;
  name: string;
  campaignType: string;
  status: string;
  objective: string;
  directnessLevel: string;
  plugFrequency: string;
  plugPercentage: number | null;
  persona: { name: string };
  _count: { generatedContent: number };
}

export default async function CampaignsPage() {
  let campaigns: Campaign[] = [];
  try {
    campaigns = await apiGet<Campaign[]>("/campaigns");
  } catch {
    return (
      <>
        <h1>Campaigns</h1>
        <div className="empty">API is not reachable.</div>
      </>
    );
  }

  return (
    <>
      <h1>Campaigns</h1>
      {campaigns.length === 0 ? (
        <div className="empty">No campaigns yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Persona</th>
              <th>Type</th>
              <th>Directness</th>
              <th>Plug frequency</th>
              <th>Status</th>
              <th>Content</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  <div className="muted">{c.objective.slice(0, 120)}</div>
                </td>
                <td>{c.persona.name}</td>
                <td className="muted">{c.campaignType}</td>
                <td className="muted">{c.directnessLevel}</td>
                <td className="muted">
                  {c.plugFrequency}
                  {c.plugPercentage != null ? ` (${c.plugPercentage}%)` : ""}
                </td>
                <td>
                  <span className={`badge ${c.status}`}>{c.status}</span>
                </td>
                <td>{c._count.generatedContent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
