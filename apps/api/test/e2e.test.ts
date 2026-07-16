/**
 * End-to-end demo scenario (product-plan §26) against live Postgres + Redis.
 *
 * Requires infra started via `pnpm dev:infra` and migrations applied.
 * Run with: pnpm test:integration
 */
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { LocalStorageAdapter } from '@hype/storage';
import { PublishingRegistry } from '@hype/publishing';
import { createContext, type AppContext } from '../src/context.js';
import { buildServer } from '../src/server.js';
import { JobSystem } from '../src/jobs/queue.js';

const API_TOKEN = 'test-token';
const auth = { authorization: `Bearer ${API_TOKEN}` };

let ctx: AppContext;
let app: FastifyInstance;
let jobs: JobSystem;
let storageDir: string;

let personaId: string;
let campaignId: string;

async function api(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
) {
  const response = await app.inject({
    method,
    url,
    headers: auth,
    ...(body !== undefined ? { payload: body as object } : {}),
  });
  return { status: response.statusCode, body: response.json() };
}

beforeAll(async () => {
  storageDir = mkdtempSync(join(tmpdir(), 'hype-e2e-'));
  const storage = new LocalStorageAdapter(storageDir);
  ctx = createContext({
    env: {
      ...((await import('../src/env.js')).loadEnv()),
      API_TOKEN,
      LLM_PROVIDER: 'stub',
      STORAGE_DRIVER: 'local',
    },
    storage,
    publishing: new PublishingRegistry(storage),
  });
  app = await buildServer(ctx);
  jobs = new JobSystem(ctx);

  // Clean slate for repeatable runs.
  await ctx.prisma.jobLog.deleteMany();
  await ctx.prisma.persona.deleteMany({ where: { slug: { startsWith: 'e2e-' } } });
  await ctx.prisma.user.upsert({
    where: { email: 'owner@hype.local' },
    update: {},
    create: { name: 'Owner', email: 'owner@hype.local', role: 'OWNER' },
  });
  await Promise.all(
    Object.values(jobs.queues).map((q) => q.obliterate({ force: true }).catch(() => undefined)),
  );
}, 60_000);

afterAll(async () => {
  await jobs.stop();
  await app.close();
  await ctx.prisma.$disconnect();
});

describe('demo scenario (§26): persona → campaign → generate → approve → publish → learn', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await app.inject({ method: 'GET', url: '/personas' });
    expect(response.statusCode).toBe(401);
  });

  it('1-2. creates Professor Steve and uploads a face reference', async () => {
    const persona = await api('POST', '/personas', {
      name: 'e2e Professor Steve',
      personaType: 'PROFESSOR',
      description: '80-year-old virtual professor.',
      backstory: 'Retired professor, internet-curious, sharp, funny.',
      worldview: 'Learning should be interactive.',
      speakingStyle: 'short sentences, dry jokes',
      tone: 'warm, blunt, amused',
      humorStyle: 'dry',
      disclosureText: 'Virtual AI-driven professor character.',
    });
    expect(persona.status).toBe(201);
    personaId = persona.body.id;

    const asset = await api('POST', `/personas/${personaId}/assets`, {
      type: 'FACE_REFERENCE',
      name: 'steve-face-v1',
      url: 'file:///assets/steve-face.png',
      isDefault: true,
    });
    expect(asset.status).toBe(201);

    const memory = await api('POST', `/personas/${personaId}/memory`, {
      type: 'RECURRING_JOKE',
      title: 'Signature line',
      content: `"I'm not even the target audience, and even I get it."`,
      importance: 0.9,
    });
    expect(memory.status).toBe(201);
  });

  it('3-5. creates the GuidedGenius campaign with sources, guardrails, schedules', async () => {
    const campaign = await api('POST', '/campaigns', {
      personaId,
      name: 'e2e GuidedGenius',
      campaignType: 'APP_PROMOTION',
      objective: 'Get views and engagement for GuidedGenius.',
      targetAudience: 'parents, students, teachers',
      productName: 'GuidedGenius',
      productDescription: 'AI tutoring app that talks students through problems.',
      productUrl: 'https://guidedgenius.com',
      directnessLevel: 'CASUAL',
      plugFrequency: 'CUSTOM_PERCENTAGE',
      plugPercentage: 60,
      mainMessage: 'Learning should be interactive, adaptive, and less boring.',
      guardrails: {
        allowedTopics: ['education', 'learning', 'edtech'],
        bannedTopics: ['medical claims'],
        allowedClaims: ['GuidedGenius helps make learning interactive.'],
        bannedClaims: ['guaranteed marks improvement', 'replaces all teachers'],
        competitorRules: { allowCompetitorMentions: false, names: ['TutorBot'] },
      },
    });
    expect(campaign.status).toBe(201);
    expect(campaign.body.guardrailConfig.bannedClaims).toContain('guaranteed marks improvement');
    campaignId = campaign.body.id;

    const source = await api('POST', `/campaigns/${campaignId}/sources`, {
      type: 'APP_VIDEO',
      title: 'App screen recording',
      content: 'Screen recording of a student using GuidedGenius to solve algebra.',
      fileUrl: 'file:///assets/app-demo.mp4',
    });
    expect(source.status).toBe(201);

    // 1 video/day at 19:00 UTC + text post every 12h (§26 step 5).
    const videoSchedule = await api('POST', `/campaigns/${campaignId}/schedules`, {
      platform: 'YOUTUBE',
      contentType: 'SHORT_VIDEO',
      cadenceType: 'CRON',
      cronExpression: '0 19 * * *',
    });
    expect(videoSchedule.status).toBe(201);
    const textSchedule = await api('POST', `/campaigns/${campaignId}/schedules`, {
      platform: 'X',
      contentType: 'TEXT_POST',
      cadenceType: 'INTERVAL',
      intervalMinutes: 720,
    });
    expect(textSchedule.status).toBe(201);
  });

  it('6-7. "Generate Now" produces a text post and a short video pending approval', async () => {
    const result = await api('POST', '/generation/run', { campaignId });
    expect(result.status).toBe(201);
    expect(result.body).toHaveLength(2);

    const types = result.body.map((r: any) => r.content.contentType).sort();
    expect(types).toEqual(['SHORT_VIDEO', 'TEXT_POST']);
    for (const item of result.body) {
      expect(item.content.status).toBe('PENDING_APPROVAL');
      expect(item.guardrails.passed).toBe(true);
      expect(item.guardrails.checklist.length).toBeGreaterThan(5);
    }

    // Short video captured a storyboard for the Phase-4 video pipeline.
    const video = result.body.find((r: any) => r.content.contentType === 'SHORT_VIDEO');
    const detail = await api('GET', `/content/${video.content.id}`);
    expect(detail.body.videoAsset.status).toBe('STORYBOARD');
    expect(detail.body.approvals[0].status).toBe('PENDING');
  });

  it('8-12. approval queue works; approving publishes via manual export', async () => {
    const queue = await api('GET', '/approvals');
    expect(queue.body.length).toBeGreaterThanOrEqual(2);

    const textItem = queue.body.find((c: any) => c.contentType === 'TEXT_POST');
    const videoItem = queue.body.find((c: any) => c.contentType === 'SHORT_VIDEO');

    const approved = await api('POST', `/approvals/${textItem.id}/approve`, {});
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('PUBLISHED');

    // Double-approval is a conflict, not a crash.
    const again = await api('POST', `/approvals/${textItem.id}/approve`, {});
    expect(again.status).toBe(409);

    // The export bundle is on disk with the post text.
    const published = await api('GET', '/published');
    const post = published.body.find((p: any) => p.generatedContentId === textItem.id);
    expect(post.platform).toBe('MANUAL_EXPORT');
    const bundle = await readFile(
      join(
        storageDir,
        'exports',
        'e2e-professor-steve',
        'e2e-guidedgenius',
        textItem.id,
        'post.txt',
      ),
      'utf8',
    );
    expect(bundle.length).toBeGreaterThan(50);

    const approvedVideo = await api('POST', `/approvals/${videoItem.id}/approve`, {});
    expect(approvedVideo.body.status).toBe('PUBLISHED');
  });

  it('13-15. metrics ingestion produces a learning insight that feeds future generations', async () => {
    const published = await api('GET', '/published');
    expect(published.body.length).toBeGreaterThanOrEqual(2);

    const [first, second] = published.body;
    const m1 = await api('POST', `/published/${first.id}/metrics`, {
      views: 42_300, likes: 2_500, comments: 180, shares: 60, saves: 30, clicks: 400,
    });
    expect(m1.status).toBe(201);
    expect(m1.body.engagementRate).toBeCloseTo(6.55, 1);
    await api('POST', `/published/${second.id}/metrics`, {
      views: 5_000, likes: 100, comments: 10, shares: 2, saves: 1, clicks: 20,
    });

    const insight = await api('POST', `/analytics/insights/${campaignId}`);
    expect(insight.status).toBe(200);
    expect(insight.body.insight.confidence).toBeGreaterThan(0);

    // §12.3: the insight became persona memory…
    const memories = await api('GET', `/personas/${personaId}/memory?q=broll`);
    const learning = memories.body.find((m: any) => m.type === 'CAMPAIGN_LEARNING');
    expect(learning).toBeTruthy();

    // …and §12.4: the next generation's prompt includes the learning.
    const next = await api('POST', `/generation/run/${campaignId}`, {
      platform: 'X',
      contentType: 'TEXT_POST',
    });
    expect(next.status).toBe(201);
    expect(next.body.content.generationPrompt).toContain('Recent performance learnings');

    // Campaign analytics rollup.
    const analytics = await api('GET', `/campaigns/${campaignId}/analytics`);
    expect(analytics.body.totals.views).toBe(47_300);
    expect(analytics.body.insights.length).toBeGreaterThanOrEqual(1);
  });

  it('rejection creates a FAILED_HOOK learning memory', async () => {
    const generated = await api('POST', `/generation/run/${campaignId}`, {
      platform: 'X',
      contentType: 'TEXT_POST',
    });
    const rejected = await api('POST', `/approvals/${generated.body.content.id}/reject`, {
      reason: 'Too preachy.',
    });
    expect(rejected.body.status).toBe('REJECTED');

    const memories = await api('GET', `/personas/${personaId}/memory`);
    expect(memories.body.some((m: any) => m.type === 'FAILED_HOOK')).toBe(true);
  });

  it('guardrails re-run on edit and block bad edits from approval', async () => {
    const generated = await api('POST', `/generation/run/${campaignId}`, {
      platform: 'X',
      contentType: 'TEXT_POST',
    });
    const contentId = generated.body.content.id;

    // Sneak a banned claim in via edit → guardrails catch it → NEEDS_EDIT.
    const badEdit = await api('POST', `/approvals/${contentId}/edit`, {
      bodyText: 'GuidedGenius: guaranteed marks improvement for every child!',
    });
    expect(badEdit.body.status).toBe('NEEDS_EDIT');

    const blockedApproval = await api('POST', `/approvals/${contentId}/approve`, {});
    expect(blockedApproval.status).toBe(409);

    // Fix it → approvable again.
    const goodEdit = await api('POST', `/approvals/${contentId}/edit`, {
      bodyText: 'GuidedGenius helps make learning interactive. Worth a look.',
    });
    expect(goodEdit.body.status).toBe('PENDING_APPROVAL');
  });

  it('regenerate quick-actions archive the old draft and produce a new one', async () => {
    const generated = await api('POST', `/generation/run/${campaignId}`, {
      platform: 'X',
      contentType: 'TEXT_POST',
    });
    const oldId = generated.body.content.id;

    const regenerated = await api('POST', `/approvals/${oldId}/regenerate`, {
      action: 'MAKE_FUNNIER',
    });
    expect(regenerated.status).toBe(200);
    expect(regenerated.body.content.id).not.toBe(oldId);
    expect(regenerated.body.content.generationPrompt).toContain('funnier');

    const old = await api('GET', `/content/${oldId}`);
    expect(old.body.status).toBe('ARCHIVED');
  });

  it('scheduled approval publishes via the BullMQ scheduler tick', async () => {
    const scheduledFor = new Date(Date.now() + 1500).toISOString();
    const generated = await api('POST', `/generation/run/${campaignId}`, {
      platform: 'X',
      contentType: 'TEXT_POST',
      scheduledFor,
    });
    const contentId = generated.body.content.id;

    const approved = await api('POST', `/approvals/${contentId}/approve`, {});
    expect(approved.body.status).toBe('SCHEDULED');

    // Start workers, then run a tick after the scheduled time passes.
    await jobs.start({ schedulerEveryMs: 60 * 60 * 1000, analyticsEveryMs: 60 * 60 * 1000 });
    await new Promise((resolve) => setTimeout(resolve, 1600));
    const tick = await jobs.tick();
    expect(tick.published).toBeGreaterThanOrEqual(1);

    // Wait for the publish worker to finish.
    let status = '';
    for (let i = 0; i < 50; i++) {
      const detail = await api('GET', `/content/${contentId}`);
      status = detail.body.status;
      if (status === 'PUBLISHED') break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(status).toBe('PUBLISHED');
  }, 30_000);

  it('scheduler tick generates content for due schedules and respects backlog limits', async () => {
    // Make the interval schedule due now.
    await ctx.prisma.contentSchedule.updateMany({
      where: { campaignId, contentType: 'TEXT_POST' },
      data: { nextRunAt: new Date(Date.now() - 1000) },
    });
    const before = await ctx.prisma.generatedContent.count({ where: { campaignId } });
    const tick = await jobs.tick();
    expect(tick.generated).toBeGreaterThanOrEqual(1);

    let after = before;
    for (let i = 0; i < 50; i++) {
      after = await ctx.prisma.generatedContent.count({ where: { campaignId } });
      if (after > before) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(after).toBeGreaterThan(before);

    // nextRunAt advanced into the future.
    const schedule = await ctx.prisma.contentSchedule.findFirstOrThrow({
      where: { campaignId, contentType: 'TEXT_POST' },
    });
    expect(schedule.nextRunAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
  }, 30_000);

  it('records job logs with cost tracking (§24, §25)', async () => {
    const logs = await api('GET', '/settings/jobs');
    expect(logs.body.length).toBeGreaterThan(0);
    const generation = logs.body.filter((l: any) => l.jobName === 'GenerateContentJob');
    expect(generation.length).toBeGreaterThan(0);
    expect(generation[0].status).toBe('SUCCEEDED');
    expect(generation[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});
