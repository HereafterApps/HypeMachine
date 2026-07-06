import { redirect } from "next/navigation";
import { apiGet, apiSend } from "@/lib/api";

const CAMPAIGN_TYPES = [
  "APP_PROMOTION",
  "BRAND_AWARENESS",
  "PRODUCT_LAUNCH",
  "TREND_PROMOTION",
  "MEDIA_LITERACY",
  "EXPLAINER",
  "COMMUNITY_BUILDING",
  "CUSTOM",
];
const DIRECTNESS = ["VERY_SUBTLE", "SUBTLE", "CASUAL", "DIRECT", "HARD_CTA"];
const PLUG_FREQ = [
  "EVERY_POST",
  "MOST_POSTS",
  "HALF_POSTS",
  "WHEN_NATURAL",
  "OCCASIONAL",
  "RARE",
];

async function createCampaign(formData: FormData) {
  "use server";
  const productUrl = formData.get("productUrl");
  await apiSend("/campaigns", "POST", {
    personaId: formData.get("personaId"),
    name: formData.get("name"),
    campaignType: formData.get("campaignType"),
    objective: formData.get("objective") || "",
    targetAudience: formData.get("targetAudience") || "",
    productName: formData.get("productName") || "",
    productDescription: formData.get("productDescription") || "",
    ...(productUrl ? { productUrl } : {}),
    directnessLevel: formData.get("directnessLevel"),
    plugFrequency: formData.get("plugFrequency"),
  });
  redirect("/campaigns");
}

export default async function NewCampaignPage() {
  let personas: Array<{ id: string; name: string; status: string }> = [];
  try {
    personas = await apiGet("/personas");
  } catch {
    return (
      <>
        <h1>New Campaign</h1>
        <div className="empty">API is not reachable.</div>
      </>
    );
  }
  const active = personas.filter((p) => p.status === "ACTIVE");

  return (
    <>
      <h1>New Campaign</h1>
      {active.length === 0 ? (
        <div className="empty">Create an active persona first.</div>
      ) : (
        <form action={createCampaign} className="stack">
          <label>
            Persona *
            <select name="personaId" required>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Campaign name *
            <input name="name" required placeholder="GuidedGenius launch" />
          </label>
          <label>
            Type
            <select name="campaignType" defaultValue="CUSTOM">
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Objective
            <textarea name="objective" rows={2} />
          </label>
          <label>
            Target audience
            <input name="targetAudience" placeholder="parents, students, teachers" />
          </label>
          <label>
            Product / topic name
            <input name="productName" />
          </label>
          <label>
            Product / topic description
            <textarea name="productDescription" rows={3} />
          </label>
          <label>
            Product URL
            <input name="productUrl" type="url" placeholder="https://…" />
          </label>
          <label>
            Directness
            <select name="directnessLevel" defaultValue="CASUAL">
              {DIRECTNESS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            Plug frequency
            <select name="plugFrequency" defaultValue="WHEN_NATURAL">
              {PLUG_FREQ.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn primary">
            Create campaign
          </button>
        </form>
      )}
    </>
  );
}
