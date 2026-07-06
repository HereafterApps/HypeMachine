import { apiGet } from "@/lib/api";

interface DashboardData {
  pendingApprovals: number;
  scheduled: number;
  generatedTotal: number;
  publishedTotal: number;
  activePersonas: number;
  activeCampaigns: number;
  recentContent: Array<{
    id: string;
    contentType: string;
    platform: string;
    status: string;
    hook: string;
    title: string;
    createdAt: string;
    persona: { name: string };
    campaign: { name: string };
  }>;
}

export default async function DashboardPage() {
  let data: DashboardData | null = null;
  try {
    data = await apiGet<DashboardData>("/dashboard");
  } catch {
    // API offline — render the shell with a hint instead of crashing.
  }

  if (!data) {
    return (
      <>
        <h1>Dashboard</h1>
        <div className="empty">
          API is not reachable. Start it with <code>pnpm dev:api</code>.
        </div>
      </>
    );
  }

  const cards = [
    { label: "Pending Approvals", value: data.pendingApprovals },
    { label: "Scheduled", value: data.scheduled },
    { label: "Generated (total)", value: data.generatedTotal },
    { label: "Published (total)", value: data.publishedTotal },
    { label: "Active Personas", value: data.activePersonas },
    { label: "Active Campaigns", value: data.activeCampaigns },
  ];

  return (
    <>
      <h1>Dashboard</h1>
      <div className="cards">
        {cards.map((c) => (
          <div className="card" key={c.label}>
            <div className="label">{c.label}</div>
            <div className="value">{c.value}</div>
          </div>
        ))}
      </div>

      <h2>Recent content</h2>
      {data.recentContent.length === 0 ? (
        <div className="empty">Nothing generated yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Hook / Title</th>
              <th>Persona</th>
              <th>Campaign</th>
              <th>Type</th>
              <th>Platform</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.recentContent.map((c) => (
              <tr key={c.id}>
                <td>{c.hook || c.title || <span className="muted">—</span>}</td>
                <td>{c.persona.name}</td>
                <td>{c.campaign.name}</td>
                <td className="muted">{c.contentType}</td>
                <td className="muted">{c.platform}</td>
                <td>
                  <span className={`badge ${c.status}`}>{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
