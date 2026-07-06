import { redirect } from "next/navigation";
import { apiSend } from "@/lib/api";

const PERSONA_TYPES = [
  "VIRTUAL_INFLUENCER",
  "BRAND_MASCOT",
  "CARTOON",
  "PUPPET",
  "EXPERT",
  "PROFESSOR",
  "FOUNDER_AVATAR",
  "FACELESS_CHANNEL",
  "SATIRICAL_CHARACTER",
  "CUSTOM",
];

async function createPersona(formData: FormData) {
  "use server";
  await apiSend("/personas", "POST", {
    name: formData.get("name"),
    personaType: formData.get("personaType"),
    description: formData.get("description") || "",
    backstory: formData.get("backstory") || "",
    speakingStyle: formData.get("speakingStyle") || "",
    tone: formData.get("tone") || "",
    humorStyle: formData.get("humorStyle") || "",
    disclosureText: formData.get("disclosureText"),
  });
  redirect("/personas");
}

export default function NewPersonaPage() {
  return (
    <>
      <h1>New Persona</h1>
      <form action={createPersona} className="stack">
        <label>
          Name *
          <input name="name" required placeholder="Professor Steve" />
        </label>
        <label>
          Type
          <select name="personaType" defaultValue="CUSTOM">
            {PERSONA_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Description
          <textarea
            name="description"
            rows={2}
            placeholder="One-liner describing the persona"
          />
        </label>
        <label>
          Backstory
          <textarea name="backstory" rows={3} />
        </label>
        <label>
          Speaking style
          <input
            name="speakingStyle"
            placeholder="short sentences, dry jokes, direct opinions"
          />
        </label>
        <label>
          Tone
          <input name="tone" placeholder="warm, blunt, amused" />
        </label>
        <label>
          Humor style
          <input name="humorStyle" placeholder="dry, self-deprecating" />
        </label>
        <label>
          Disclosure text * <span className="muted">(shown in bios — every persona is openly virtual/AI-driven)</span>
          <input
            name="disclosureText"
            required
            placeholder="Virtual AI-driven character."
          />
        </label>
        <button type="submit" className="btn primary">
          Create persona
        </button>
      </form>
    </>
  );
}
