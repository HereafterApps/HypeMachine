import { revalidatePath } from "next/cache";
import { apiGet, apiSend } from "@/lib/api";

interface ContentItem {
  id: string;
  contentType: string;
  platform: string;
  hook: string;
  title: string;
  bodyText: string;
  caption: string;
  script: string;
  cta: string;
  hashtags: string[];
  riskScore: number;
  guardrailResult: {
    passed: boolean;
    warnings: string[];
    blockers: string[];
    requiredEdits: string[];
  } | null;
  persona: { name: string };
  campaign: { name: string };
}

async function act(contentId: string, action: string) {
  "use server";
  await apiSend(`/approvals/${contentId}`, "POST", { action });
  revalidatePath("/approvals");
}

export default async function ApprovalsPage() {
  let items: ContentItem[] = [];
  try {
    items = await apiGet<ContentItem[]>("/approvals");
  } catch {
    return (
      <>
        <h1>Approvals</h1>
        <div className="empty">API is not reachable.</div>
      </>
    );
  }

  return (
    <>
      <h1>Approvals</h1>
      <p className="muted">
        Nothing publishes without approval. Approving marks content ready;
        publishing is a separate explicit step.
      </p>
      {items.length === 0 ? (
        <div className="empty">Approval queue is empty. 🎉</div>
      ) : (
        items.map((c) => (
          <div className="card" key={c.id} style={{ marginBottom: 14 }}>
            <div className="label">
              {c.persona.name} · {c.campaign.name} · {c.contentType} ·{" "}
              {c.platform} · risk {c.riskScore.toFixed(2)}
            </div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              {c.hook || c.title}
            </div>
            <div style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>
              {c.bodyText || c.script || c.caption}
            </div>
            {c.cta ? <div className="muted">CTA: {c.cta}</div> : null}
            {c.hashtags.length > 0 ? (
              <div className="muted">{c.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</div>
            ) : null}
            {c.guardrailResult && !c.guardrailResult.passed ? (
              <div style={{ color: "var(--red)", marginTop: 8 }}>
                Guardrail blockers:{" "}
                {[...c.guardrailResult.blockers, ...c.guardrailResult.requiredEdits].join(
                  "; ",
                )}
              </div>
            ) : null}
            {c.guardrailResult && c.guardrailResult.warnings.length > 0 ? (
              <div style={{ color: "var(--amber)", marginTop: 4 }}>
                Warnings: {c.guardrailResult.warnings.join("; ")}
              </div>
            ) : null}
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <form action={act.bind(null, c.id, "APPROVE")}>
                <button type="submit">Approve</button>
              </form>
              <form action={act.bind(null, c.id, "REJECT")}>
                <button type="submit">Reject</button>
              </form>
              <form action={act.bind(null, c.id, "REGENERATE")}>
                <button type="submit">Regenerate</button>
              </form>
              <form action={act.bind(null, c.id, "MAKE_FUNNIER")}>
                <button type="submit">Make funnier</button>
              </form>
              <form action={act.bind(null, c.id, "MAKE_MORE_SUBTLE")}>
                <button type="submit">More subtle</button>
              </form>
            </div>
          </div>
        ))
      )}
    </>
  );
}
