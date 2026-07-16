import type { AppContext } from '../context.js';

/** Observability wrapper (product-plan §24, §25). */
export async function withJobLog<T>(
  ctx: AppContext,
  meta: {
    jobName: string;
    jobId?: string;
    personaId?: string;
    campaignId?: string;
    contentId?: string;
    provider?: string;
  },
  fn: () => Promise<T & { costUsd?: number }>,
): Promise<T & { costUsd?: number }> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    await ctx.prisma.jobLog.create({
      data: {
        ...meta,
        status: 'SUCCEEDED',
        durationMs: Date.now() - startedAt,
        costUsd: result?.costUsd,
      },
    });
    return result;
  } catch (error) {
    await ctx.prisma.jobLog
      .create({
        data: {
          ...meta,
          status: 'FAILED',
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        },
      })
      .catch(() => undefined);
    throw error;
  }
}
