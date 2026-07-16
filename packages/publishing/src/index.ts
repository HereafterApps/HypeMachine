import type { AnalyticsMetrics, Platform, PublishResult } from '@hype/core';
import type { StorageAdapter } from '@hype/storage';

/** Content payload handed to a provider — plain data, no DB coupling. */
export interface PublishInput {
  contentId: string;
  personaSlug: string;
  campaignSlug: string;
  contentType: string;
  title?: string | null;
  hook?: string | null;
  script?: string | null;
  caption?: string | null;
  bodyText?: string | null;
  hashtags: string[];
  cta?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  imageUrls?: string[];
  accountHandle?: string | null;
  /** Decrypted access token when the account is API-connected. */
  accessToken?: string | null;
}

/** Provider interface from product-plan §16.5 / §7.6. */
export interface PublishingProvider {
  readonly platform: Platform;
  /** True when this provider can actually publish with the given input. */
  isConfigured(input: PublishInput): boolean;
  publish(input: PublishInput): Promise<PublishResult>;
  fetchMetrics(platformPostId: string): Promise<AnalyticsMetrics>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(platform: Platform, detail: string) {
    super(`${platform} publishing is not configured: ${detail}`);
    this.name = 'ProviderNotConfiguredError';
  }
}

export class MetricsUnavailableError extends Error {
  constructor(platform: Platform) {
    super(`${platform} metrics are not available for this provider.`);
    this.name = 'MetricsUnavailableError';
  }
}

/**
 * Fully working v1 provider (product-plan §2): writes a download bundle —
 * post text, caption, hashtags, metadata — that the operator uploads by
 * hand to any platform without API access.
 */
export class ManualExportProvider implements PublishingProvider {
  readonly platform = 'MANUAL_EXPORT' as const;

  constructor(private readonly storage: StorageAdapter) {}

  isConfigured(): boolean {
    return true;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const exportId = `export-${input.contentId}`;
    const baseKey = `exports/${input.personaSlug}/${input.campaignSlug}/${input.contentId}`;

    const postText = [
      input.title && `# ${input.title}`,
      input.hook && `Hook: ${input.hook}`,
      input.bodyText,
      input.script && `--- script ---\n${input.script}`,
      input.caption && `--- caption ---\n${input.caption}`,
      input.cta && `CTA: ${input.cta}`,
      input.hashtags.length ? input.hashtags.join(' ') : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    const metadata = {
      exportId,
      contentId: input.contentId,
      contentType: input.contentType,
      persona: input.personaSlug,
      campaign: input.campaignSlug,
      videoUrl: input.videoUrl ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      imageUrls: input.imageUrls ?? [],
      hashtags: input.hashtags,
    };

    await this.storage.put(`${baseKey}/post.txt`, postText, 'text/plain');
    const { url } = await this.storage.put(
      `${baseKey}/metadata.json`,
      JSON.stringify(metadata, null, 2),
      'application/json',
    );

    return {
      platformPostId: exportId,
      platformUrl: url,
      rawResponse: metadata,
    };
  }

  async fetchMetrics(): Promise<AnalyticsMetrics> {
    // Manual exports have no API metrics; operators enter them by hand
    // via POST /published/:id/metrics.
    throw new MetricsUnavailableError(this.platform);
  }
}

/**
 * YouTube / X providers are Phase-5 slots (product-plan §21). They implement
 * the full interface so wiring them in later is a drop-in: give them a real
 * transport and flip isConfigured. Until then the publishing service falls
 * back to manual export.
 */
abstract class ApiProviderSlot implements PublishingProvider {
  abstract readonly platform: Platform;

  isConfigured(input: PublishInput): boolean {
    return Boolean(input.accessToken);
  }

  publish(input: PublishInput): Promise<PublishResult> {
    throw new ProviderNotConfiguredError(
      this.platform,
      input.accessToken
        ? 'API transport not implemented yet (Phase 5) — use manual export.'
        : 'no connected account/token — use manual export.',
    );
  }

  fetchMetrics(): Promise<AnalyticsMetrics> {
    throw new MetricsUnavailableError(this.platform);
  }
}

export class YouTubeProvider extends ApiProviderSlot {
  readonly platform = 'YOUTUBE' as const;
}
export class XProvider extends ApiProviderSlot {
  readonly platform = 'X' as const;
}
export class TikTokProvider extends ApiProviderSlot {
  readonly platform = 'TIKTOK' as const;
}
export class InstagramProvider extends ApiProviderSlot {
  readonly platform = 'INSTAGRAM' as const;
}
export class LinkedInProvider extends ApiProviderSlot {
  readonly platform = 'LINKEDIN' as const;
}
export class FacebookProvider extends ApiProviderSlot {
  readonly platform = 'FACEBOOK' as const;
}
export class ThreadsProvider extends ApiProviderSlot {
  readonly platform = 'THREADS' as const;
}
/** Opted-in broadcasts / inbound replies only (product-plan §0.1). */
export class WhatsAppProvider extends ApiProviderSlot {
  readonly platform = 'WHATSAPP' as const;
}

export class PublishingRegistry {
  private readonly providers = new Map<Platform, PublishingProvider>();
  readonly manualExport: ManualExportProvider;

  constructor(storage: StorageAdapter) {
    this.manualExport = new ManualExportProvider(storage);
    for (const provider of [
      this.manualExport,
      new YouTubeProvider(),
      new XProvider(),
      new TikTokProvider(),
      new InstagramProvider(),
      new LinkedInProvider(),
      new FacebookProvider(),
      new ThreadsProvider(),
      new WhatsAppProvider(),
    ] as PublishingProvider[]) {
      this.providers.set(provider.platform, provider);
    }
  }

  get(platform: Platform): PublishingProvider | undefined {
    return this.providers.get(platform);
  }

  /**
   * The provider that will actually be used: the platform's own provider if
   * configured, otherwise manual export (product-plan §2 fallback).
   */
  resolve(platform: Platform, input: PublishInput): PublishingProvider {
    const provider = this.providers.get(platform);
    if (provider && provider.isConfigured(input)) return provider;
    return this.manualExport;
  }
}
