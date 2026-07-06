import { apiGet } from "@/lib/api";

interface ContentItem {
  id: string;
  contentType: string;
  platform: string;
  status: string;
  hook: string;
  title: string;
  bodyText: string;
  caption: string;
  riskScore: number;
  createdAt: string;
  persona: { name: string };
  campaign: { name: string };
}

export default async function QueuePage() {
  let items: ContentItem[] = [];
  try {
    items = await apiGet<ContentItem[]>("/content");
  } catch {
    return (
      <>
        <h1>Content Queue</h1>
        <div className="empty">API is not reachable.</div>
      </>
    );
  }

  return (
    <>
      <h1>Content Queue</h1>
      {items.length === 0 ? (
        <div className="empty">
          Nothing here yet. Generate content via{" "}
          <code>POST /generation/run</code>.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Content</th>
              <th>Persona / Campaign</th>
              <th>Type</th>
              <th>Platform</th>
              <th>Risk</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.hook || c.title || "—"}</strong>
                  <div className="muted">
                    {(c.bodyText || c.caption).slice(0, 160)}
                  </div>
                </td>
                <td>
                  {c.persona.name}
                  <div className="muted">{c.campaign.name}</div>
                </td>
                <td className="muted">{c.contentType}</td>
                <td className="muted">{c.platform}</td>
                <td className="muted">{c.riskScore.toFixed(2)}</td>
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
