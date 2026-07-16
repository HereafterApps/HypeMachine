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
        if (!['APPROVED', 'SCHEDULED'].includes(content.status)) {
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
        await this.ctx.prisma.generatedContent.update({
          where: { id: content.id },
          data: { status: 'PUBLISHING' },
        });

        try {
          const result = await provider.publish(input);
          const published = await this.ctx.prisma.publishedPost.create({
            data: {
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
        } catch (error) {
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
      },
    );
  }
}
