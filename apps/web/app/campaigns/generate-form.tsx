import { redirect } from "next/navigation";
import { apiSend } from "@/lib/api";

async function generateNow(formData: FormData) {
  "use server";
  await apiSend("/generation/run", "POST", {
    campaignId: formData.get("campaignId"),
    contentType: formData.get("contentType"),
    platform: formData.get("platform"),
  });
  redirect("/approvals");
}

export function GenerateForm({ campaignId }: { campaignId: string }) {
  return (
    <form action={generateNow} className="inline-form">
      <input type="hidden" name="campaignId" value={campaignId} />
      <select name="contentType" defaultValue="TEXT_POST">
        <option value="TEXT_POST">Text post</option>
        <option value="SHORT_VIDEO">Short video</option>
      </select>
      <select name="platform" defaultValue="X">
        <option value="X">X</option>
        <option value="YOUTUBE">YouTube</option>
        <option value="INSTAGRAM">Instagram</option>
        <option value="TIKTOK">TikTok</option>
        <option value="LINKEDIN">LinkedIn</option>
        <option value="MANUAL_EXPORT">Manual export</option>
      </select>
      <button type="submit" className="btn primary">
        Generate
      </button>
    </form>
  );
}
