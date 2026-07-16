import type { NotificationEvent } from '@hype/core';

export interface Notifier {
  readonly channel: string;
  notify(event: NotificationEvent): Promise<void>;
}

/** Always-available fallback: logs the notification. */
export class ConsoleNotifier implements Notifier {
  readonly channel = 'console';

  async notify(event: NotificationEvent): Promise<void> {
    const lines = [
      `[notify:${event.kind}] ${event.title}`,
      event.body,
      event.dashboardUrl ? `Dashboard: ${event.dashboardUrl}` : '',
    ].filter(Boolean);
    console.log(lines.join('\n'));
  }
}

/** Discord webhook — first-choice approval channel (product-plan §3.1). */
export class DiscordWebhookNotifier implements Notifier {
  readonly channel = 'discord';

  constructor(private readonly webhookUrl: string) {
    if (!webhookUrl) throw new Error('DiscordWebhookNotifier requires a webhook URL.');
  }

  async notify(event: NotificationEvent): Promise<void> {
    const embed: Record<string, unknown> = {
      title: event.title,
      description: event.body.slice(0, 4000),
      color: event.kind === 'PUBLISH_FAILED' || event.kind === 'JOB_FAILED' ? 0xdc2626 : 0x2563eb,
    };
    if (event.approval) {
      embed.fields = [
        { name: 'Persona', value: event.approval.personaName, inline: true },
        { name: 'Campaign', value: event.approval.campaignName, inline: true },
        { name: 'Platform', value: event.approval.platform, inline: true },
        { name: 'Type', value: event.approval.contentType, inline: true },
        { name: 'Risk', value: event.approval.riskLevel, inline: true },
        {
          name: 'Scheduled',
          value: event.approval.scheduledFor
            ? new Date(event.approval.scheduledFor).toISOString()
            : 'not scheduled',
          inline: true,
        },
        { name: 'Hook', value: event.approval.hook.slice(0, 1000) || '—' },
        { name: 'Review', value: event.approval.dashboardUrl },
      ];
    } else if (event.dashboardUrl) {
      embed.url = event.dashboardUrl;
    }

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.status} ${await response.text()}`);
    }
  }
}

/** SES email — loads the AWS SDK lazily so local dev needs no AWS deps. */
export class SesEmailNotifier implements Notifier {
  readonly channel = 'email';
  private sdkPromise: Promise<any> | undefined;

  constructor(
    private readonly options: { region: string; from: string; to: string },
  ) {
    if (!options.region || !options.from || !options.to) {
      throw new Error('SesEmailNotifier requires region, from, and to.');
    }
  }

  private async sdk() {
    this.sdkPromise ??= import('@aws-sdk/client-ses' as string).catch(() => {
      throw new Error(
        'Email notifications selected but @aws-sdk/client-ses is not installed. Run: pnpm add @aws-sdk/client-ses --filter @hype/notifications',
      );
    });
    return this.sdkPromise;
  }

  async notify(event: NotificationEvent): Promise<void> {
    const { SESClient, SendEmailCommand } = await this.sdk();
    const client = new SESClient({ region: this.options.region });
    const bodyLines = [event.body];
    if (event.approval) {
      bodyLines.push(
        '',
        `Persona: ${event.approval.personaName}`,
        `Campaign: ${event.approval.campaignName}`,
        `Type: ${event.approval.contentType}`,
        `Platform: ${event.approval.platform}`,
        `Hook: ${event.approval.hook}`,
        `Risk: ${event.approval.riskLevel}`,
        `Review: ${event.approval.dashboardUrl}`,
      );
    } else if (event.dashboardUrl) {
      bodyLines.push('', `Dashboard: ${event.dashboardUrl}`);
    }
    await client.send(
      new SendEmailCommand({
        Source: this.options.from,
        Destination: { ToAddresses: [this.options.to] },
        Message: {
          Subject: { Data: event.title },
          Body: { Text: { Data: bodyLines.join('\n') } },
        },
      }),
    );
  }
}

/** Fan-out with error isolation — one failing channel never blocks others. */
export class CompositeNotifier implements Notifier {
  readonly channel = 'composite';

  constructor(private readonly notifiers: Notifier[]) {}

  async notify(event: NotificationEvent): Promise<void> {
    const results = await Promise.allSettled(
      this.notifiers.map((n) => n.notify(event)),
    );
    for (const [i, result] of results.entries()) {
      if (result.status === 'rejected') {
        console.error(
          `Notifier "${this.notifiers[i]?.channel}" failed:`,
          result.reason,
        );
      }
    }
  }
}

/** Builds the notifier stack from env (NOTIFY_CHANNELS=console,discord,email). */
export function createNotifier(env: NodeJS.ProcessEnv = process.env): Notifier {
  const channels = (env.NOTIFY_CHANNELS ?? 'console')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const notifiers: Notifier[] = [];
  for (const channel of channels) {
    switch (channel) {
      case 'console':
        notifiers.push(new ConsoleNotifier());
        break;
      case 'discord':
        if (env.DISCORD_WEBHOOK_URL) {
          notifiers.push(new DiscordWebhookNotifier(env.DISCORD_WEBHOOK_URL));
        } else {
          console.warn('discord channel enabled but DISCORD_WEBHOOK_URL is unset — skipping.');
        }
        break;
      case 'email':
        if (env.SES_REGION && env.NOTIFY_EMAIL_FROM && env.NOTIFY_EMAIL_TO) {
          notifiers.push(
            new SesEmailNotifier({
              region: env.SES_REGION,
              from: env.NOTIFY_EMAIL_FROM,
              to: env.NOTIFY_EMAIL_TO,
            }),
          );
        } else {
          console.warn('email channel enabled but SES env vars are unset — skipping.');
        }
        break;
      default:
        console.warn(`Unknown notification channel "${channel}" — skipping.`);
    }
  }
  if (notifiers.length === 0) notifiers.push(new ConsoleNotifier());
  return new CompositeNotifier(notifiers);
}
