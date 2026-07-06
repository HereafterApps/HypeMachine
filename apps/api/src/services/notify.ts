// Approval notifications (plan §7.7). Discord webhook first; email later.
// Failures are logged and swallowed — a notification outage must never
// block the generation pipeline.
import type { GeneratedContent } from "@hype/db";

export async function notifyPendingApproval(
  content: GeneratedContent,
  personaName: string,
  campaignName: string,
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const preview = (content.hook || content.title || content.bodyText).slice(0, 180);
  const dashboardUrl = process.env.WEB_URL ?? "http://localhost:3000";

  const body = {
    embeds: [
      {
        title: `New content awaiting approval`,
        description: [
          `**${personaName} / ${campaignName}**`,
          `Type: ${content.contentType} · Platform: ${content.platform}`,
          `Hook: ${preview}`,
          `Risk score: ${content.riskScore.toFixed(2)}`,
          ``,
          `[Open approvals](${dashboardUrl}/approvals)`,
        ].join("\n"),
        color: 0xe0a83e,
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`Discord notification failed: ${res.status}`);
    }
  } catch (err) {
    console.error("Discord notification failed:", err);
  }
}
