import { Queue, Worker, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import parser from 'cron-parser';
import type { ContentType, Platform } from '@hype/db';
import type { AppContext } from '../context.js';
import { GenerationService } from '../services/generation-service.js';
import { PublishingService } from '../services/publishing-service.js';
import { AnalyticsService } from '../services/analytics-service.js';

export interface GenerateJobData {
  campaignId: string;
  platform: Platform;
  contentType: ContentType;
  scheduleId?: string;
}

export interface PublishJobData {
  contentId: string;
}

const QUEUE_NAMES = {
  scheduler: 'hype-scheduler',
  generate: 'hype-generate',
  publish: 'hype-publish',
  analytics: 'hype-analytics',
} as const;

const DEFAULT_JOB_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 500,
  removeOnFail: 1000,
};

/** Max unreviewed items per campaign before generation pauses (§10). */
const APPROVAL_BACKLOG_LIMIT = 20;

/** Wall-clock hour in an IANA timezone (falls back to UTC on bad tz). */
function hourInTimezone(date: Date, timezone: string): number {
  try {
    return Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hour12: false,
        timeZone: timezone,
      }).format(date),
    );
  } catch {
    return date.getUTCHours();
  }
}

export class JobSystem {
  private readonly connection: Redis;
  readonly queues: Record<keyof typeof QUEUE_NAMES, Queue>;
  private workers: Worker[] = [];
  private readonly generation: GenerationService;
  private readonly publishing: PublishingService;
  private readonly analytics: AnalyticsService;

  constructor(private readonly ctx: AppContext) {
    this.connection = new Redis(ctx.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queues = Object.fromEntries(
      Object.entries(QUEUE_NAMES).map(([key, name]) => [
        key,
        new Queue(name, { connection: this.connection, defaultJobOptions: DEFAULT_JOB_OPTS }),
      ]),
    ) as Record<keyof typeof QUEUE_NAMES, Queue>;
    this.generation = new GenerationService(ctx);
    this.publishing = new PublishingService(ctx);
    this.analytics = new AnalyticsService(ctx);
  }

  async start(options: { schedulerEveryMs?: number; analyticsEveryMs?: number } = {}) {
    const workerConnection = () =>
      new Redis(this.ctx.env.REDIS_URL, { maxRetriesPerRequest: null });

    this.workers = [
      new Worker(
        QUEUE_NAMES.scheduler,
        async () => this.tick(),
        { connection: workerConnection() },
      ),
      new Worker<GenerateJobData>(
        QUEUE_NAMES.generate,
        async (job) => {
          await this.generation.generate(job.data);
        },
        { connection: workerConnection(), concurrency: 2 },
      ),
      new Worker<PublishJobData>(
        QUEUE_NAMES.publish,
        async (job) => {
          await this.publishing.publish(job.data.contentId);
        },
        { connection: workerConnection(), concurrency: 2 },
      ),
      new Worker(
        QUEUE_NAMES.analytics,
        async () => {
          await this.analytics.ingestAll();
          const campaigns = await this.ctx.prisma.campaign.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true },
          });
          for (const campaign of campaigns) {
            await this.analytics.generateInsights(campaign.id).catch((error) => {
              console.error(`Insight generation failed for ${campaign.id}:`, error);
            });
          }
        },
        { connection: workerConnection() },
      ),
    ];

    for (const worker of this.workers) {
      worker.on('failed', (job, error) => {
        console.error(`[${worker.name}] job ${job?.id} failed:`, error.message);
      });
    }

    // GenerateScheduledContentJob — every minute (§18.1).
    await this.queues.scheduler.upsertJobScheduler(
      'scheduler-tick',
      { every: options.schedulerEveryMs ?? 60_000 },
      { name: 'tick' },
    );
    // FetchAnalyticsJob — every 6 hours (§18.4).
    await this.queues.analytics.upsertJobScheduler(
      'analytics-tick',
      { every: options.analyticsEveryMs ?? 6 * 60 * 60 * 1000 },
      { name: 'tick' },
    );
  }

  /** One scheduler pass: due schedules → generate; due content → publish. */
  async tick(now: Date = new Date()) {
    const dueSchedules = await this.ctx.prisma.contentSchedule.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
        campaign: {
          status: 'ACTIVE',
          persona: { status: 'ACTIVE' },
          // Campaigns stop generating past their end date (disposable missions).
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
      },
      include: { campaign: true },
    });

    let generated = 0;
    const backlogByCampaign = new Map<string, number>();
    for (const schedule of dueSchedules) {
      // One broken row (bad cron/timezone) must never brick the whole tick:
      // deactivate it, log, and keep going.
      try {
        const skip = await this.shouldSkip(schedule, now, backlogByCampaign);
        const nextRunAt = this.computeNextRun(schedule, now);
        await this.ctx.prisma.contentSchedule.update({
          where: { id: schedule.id },
          data: { nextRunAt },
        });
        if (skip) continue;
        await this.queues.generate.add('generate', {
          campaignId: schedule.campaignId,
          platform: schedule.platform,
          contentType: schedule.contentType,
          scheduleId: schedule.id,
        } satisfies GenerateJobData);
        generated++;
      } catch (error) {
        await this.ctx.prisma.contentSchedule.update({
          where: { id: schedule.id },
          data: { isActive: false },
        });
        await this.ctx.prisma.jobLog.create({
          data: {
            jobName: 'GenerateScheduledContentJob',
            campaignId: schedule.campaignId,
            status: 'FAILED',
            error: `Schedule ${schedule.id} deactivated: ${error instanceof Error ? error.message : error}`,
          },
        });
      }
    }

    const dueContent = await this.ctx.prisma.generatedContent.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledFor: { lte: now },
        // Pausing a campaign or persona pauses its scheduled publishes too.
        campaign: { status: 'ACTIVE', persona: { status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    for (const content of dueContent) {
      await this.queues.publish.add(
        'publish',
        { contentId: content.id } satisfies PublishJobData,
        { jobId: `publish-${content.id}` }, // idempotent across ticks
      );
    }

    return { generated, published: dueContent.length };
  }

  private async shouldSkip(
    schedule: {
      id: string;
      campaignId: string;
      maxDailyCount: number | null;
      quietHoursStart: number | null;
      quietHoursEnd: number | null;
      timezone: string;
      platform: Platform;
      contentType: ContentType;
    },
    now: Date,
    backlogByCampaign: Map<string, number>,
  ): Promise<boolean> {
    // Quiet hours (§10) — evaluated in the schedule's own timezone.
    if (schedule.quietHoursStart != null && schedule.quietHoursEnd != null) {
      const hour = hourInTimezone(now, schedule.timezone);
      const inQuiet =
        schedule.quietHoursStart <= schedule.quietHoursEnd
          ? hour >= schedule.quietHoursStart && hour < schedule.quietHoursEnd
          : hour >= schedule.quietHoursStart || hour < schedule.quietHoursEnd;
      if (inQuiet) return true;
    }
    // Max daily generation count (§10).
    if (schedule.maxDailyCount != null) {
      const dayStart = new Date(now);
      dayStart.setUTCHours(0, 0, 0, 0);
      const todayCount = await this.ctx.prisma.generatedContent.count({
        where: {
          campaignId: schedule.campaignId,
          platform: schedule.platform,
          contentType: schedule.contentType,
          createdAt: { gte: dayStart },
        },
      });
      if (todayCount >= schedule.maxDailyCount) return true;
    }
    // Approval backlog limit (§10) — counted once per campaign per tick.
    let backlog = backlogByCampaign.get(schedule.campaignId);
    if (backlog == null) {
      backlog = await this.ctx.prisma.generatedContent.count({
        where: { campaignId: schedule.campaignId, status: 'PENDING_APPROVAL' },
      });
      backlogByCampaign.set(schedule.campaignId, backlog);
    }
    return backlog >= APPROVAL_BACKLOG_LIMIT;
  }

  private computeNextRun(
    schedule: {
      cadenceType: 'CRON' | 'INTERVAL';
      cronExpression: string | null;
      intervalMinutes: number | null;
      timezone: string;
    },
    now: Date,
  ): Date {
    if (schedule.cadenceType === 'CRON' && schedule.cronExpression) {
      return parser
        .parseExpression(schedule.cronExpression, { currentDate: now, tz: schedule.timezone })
        .next()
        .toDate();
    }
    const minutes = schedule.intervalMinutes ?? 60 * 24;
    return new Date(now.getTime() + minutes * 60_000);
  }

  async stop() {
    await Promise.allSettled(this.workers.map((w) => w.close()));
    await Promise.allSettled(Object.values(this.queues).map((q) => q.close()));
    await this.connection.quit().catch(() => undefined);
  }
}
