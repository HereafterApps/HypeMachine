import Link from "next/link";
import { apiGet } from "@/lib/api";

interface Persona {
  id: string;
  name: string;
  slug: string;
  personaType: string;
  status: string;
  description: string;
  disclosureText: string;
  _count: { campaigns: number; generatedContent: number };
}

export default async function PersonasPage() {
  let personas: Persona[] = [];
  try {
    personas = await apiGet<Persona[]>("/personas");
  } catch {
    return (
      <>
        <h1>Personas</h1>
        <div className="empty">API is not reachable.</div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Personas</h1>
        <Link className="btn primary" href="/personas/new">
          + New persona
        </Link>
      </div>
      {personas.length === 0 ? (
        <div className="empty">
          No personas yet. Create one, or seed the starter template with{" "}
          <code>pnpm seed</code>.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Disclosure</th>
              <th>Campaigns</th>
              <th>Content</th>
            </tr>
          </thead>
          <tbody>
            {personas.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  <div className="muted">{p.description.slice(0, 120)}</div>
                </td>
                <td className="muted">{p.personaType}</td>
                <td>
                  <span className={`badge ${p.status}`}>{p.status}</span>
                </td>
                <td className="muted">{p.disclosureText}</td>
                <td>{p._count.campaigns}</td>
                <td>{p._count.generatedContent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
