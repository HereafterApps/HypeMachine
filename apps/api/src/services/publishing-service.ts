import type { AppContext } from '../context.js';
import { withJobLog } from './job-log.js';

/** Publishes approved content via the provider registry (product-plan §7.6). */
export class PublishingService {
  constructor(private readonly ctx: AppContext) {}

  async publish(contentId: string) {
    return withJobLog(
      this.ctx,
      { jobName: 'PublishApprovedContentJob', contentId },
      async () => {
        const content = await this.ctx.prisma.generatedContent.findUniqueOrThrow({
          where: { id: contentId },
          include: { persona: true, campaign: true, videoAsset: true },
        });
        // Atomic claim: concurrent publish attempts (route vs scheduler, or
        // BullMQ retries) cannot double-post. FAILED is claimable so a
        // transient provider error can be retried.
        const claimed = await this.ctx.prisma.generatedContent.updateMany({
          where: { id: contentId, status: { in: ['APPROVED', 'SCHEDULED', 'FAILED'] } },
          data: { status: 'PUBLISHING' },
        });
        if (claimed.count === 0) {
          throw new Error(
            `Content ${contentId} is ${content.status}; only APPROVED/SCHEDULED content can publish.`,
          );
        }

        const account = await this.ctx.prisma.platformAccount.findFirst({
          where: { personaId: content.personaId, platform: content.platform },
        });

        const input = {
          contentId: content.id,
          personaSlug: content.persona.slug,
          campaignSlug: content.campaign.slug,
          contentType: content.contentType,
          title: content.title,
          hook: content.hook,
          script: content.script,
          caption: content.caption,
          bodyText: content.bodyText,
          hashtags: content.hashtags,
          cta: content.cta,
          videoUrl: content.videoAsset?.finalVideoUrl ?? null,
          thumbnailUrl: content.videoAsset?.thumbnailUrl ?? null,
          accountHandle: account?.handle ?? null,
          accessToken:
            account?.authStatus === 'CONNECTED' && account.accessTokenEncrypted
              ? this.ctx.crypto.decrypt(account.accessTokenEncrypted)
              : null,
        };

        const provider = this.ctx.publishing.resolve(content.platform, input);

        let result;
        try {
          result = await provider.publish(input);
        } catch (error) {
          // Provider failure: the post is NOT live — FAILED is accurate and
          // retryable (via the claim above).
          await this.ctx.prisma.generatedContent.update({
            where: { id: content.id },
            data: { status: 'FAILED' },
          });
          await this.ctx.notifier.notify({
            kind: 'PUBLISH_FAILED',
            title: `Publish failed: ${content.persona.name} / ${content.campaign.name}`,
            body: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }

        // Past this point the post IS live: never mark FAILED. If a DB write
        // below fails, the row stays PUBLISHING for reconciliation instead of
        // inviting a duplicate publish.
        const published = await this.ctx.prisma.publishedPost.upsert({
          where: { generatedContentId: content.id },
          update: {},
          create: {
            generatedContentId: content.id,
            platform: provider.platform,
            platformPostId: result.platformPostId,
            platformUrl: result.platformUrl,
            rawResponse: JSON.parse(JSON.stringify(result.rawResponse ?? null)),
          },
        });
        await this.ctx.prisma.generatedContent.update({
          where: { id: content.id },
          data: { status: 'PUBLISHED' },
        });
        await this.ctx.notifier.notify({
          kind: 'PUBLISH_SUCCEEDED',
          title: `Published: ${content.persona.name} / ${content.campaign.name}`,
          body:
            provider.platform === 'MANUAL_EXPORT'
              ? `Export bundle ready for manual upload: ${result.platformUrl ?? result.platformPostId}`
              : `Live at ${result.platformUrl ?? result.platformPostId}`,
        });
        return { published, provider: provider.platform };
      },
    );
  }
}
