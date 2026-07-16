/**
 * Seeds the starter templates from product-plan §13 (Professor Steve),
 * §14 (GuidedGenius campaign) and §20 (ethics config). Idempotent —
 * re-running updates in place.
 */
import { getPrisma, disconnectPrisma, type Campaign, type Persona, type User } from './index.js';

export async function seed(): Promise<{ owner: User; steve: Persona; campaign: Campaign }> {
  const prisma = getPrisma();

  const owner = await prisma.user.upsert({
    where: { email: 'owner@hype.local' },
    update: {},
    create: { name: 'Owner', email: 'owner@hype.local', role: 'OWNER' },
  });

  const steve = await prisma.persona.upsert({
    where: { slug: 'professor-steve' },
    update: {},
    create: {
      ownerId: owner.id,
      name: 'Professor Steve',
      slug: 'professor-steve',
      status: 'ACTIVE',
      personaType: 'PROFESSOR',
      description:
        '80-year-old virtual professor who reacts to internet trends and casually explains why smarter learning tools matter.',
      backstory:
        'Retired professor, internet-curious, sharp, funny, slightly grumpy. Taught for 50 years, now runs a webcam channel from a messy desk with books and a tea mug.',
      worldview:
        'Old but internet-aware, surprisingly open-minded. Believes learning should be interactive, not passive.',
      speakingStyle: 'short sentences, dry jokes, direct opinions',
      tone: 'warm, blunt, amused',
      humorStyle: 'dry, self-deprecating about age, mildly grumpy',
      disclosureText: 'Virtual AI-driven professor character.',
      defaultLanguage: 'en',
      memoryEnabled: true,
    },
  });

  const baseMemories: {
    type:
      | 'BACKSTORY'
      | 'RECURRING_JOKE'
      | 'HABIT'
      | 'VISUAL_DETAIL'
      | 'OPINION';
    title: string;
    content: string;
    importance: number;
  }[] = [
    {
      type: 'RECURRING_JOKE',
      title: 'Signature line',
      content: `"I'm not even the target audience, and even I get it."`,
      importance: 0.9,
    },
    {
      type: 'VISUAL_DETAIL',
      title: 'Set dressing',
      content:
        'Old professor on webcam, messy desk, stacks of books, tea mug, slightly chaotic lighting.',
      importance: 0.8,
    },
    {
      type: 'HABIT',
      title: 'Squints at phone',
      content: 'Squints at his phone before reacting to anything new on the internet.',
      importance: 0.6,
    },
    {
      type: 'OPINION',
      title: 'On passive learning',
      content: 'Thinks staring at a dead PDF is not learning; interactivity is everything.',
      importance: 0.7,
    },
    {
      type: 'BACKSTORY',
      title: 'Teaching career',
      content: 'Taught for 50 years; used to throw chalk at the board to keep children awake.',
      importance: 0.7,
    },
  ];

  for (const memory of baseMemories) {
    const existing = await prisma.personaMemory.findFirst({
      where: { personaId: steve.id, title: memory.title },
    });
    if (!existing) {
      await prisma.personaMemory.create({
        data: { personaId: steve.id, source: 'seed', ...memory },
      });
    }
  }

  for (const account of [
    { platform: 'YOUTUBE', handle: '@professorsteve' },
    { platform: 'X', handle: '@profsteve' },
    { platform: 'MANUAL_EXPORT', handle: 'manual' },
  ] as const) {
    await prisma.platformAccount.upsert({
      where: {
        personaId_platform_handle: {
          personaId: steve.id,
          platform: account.platform,
          handle: account.handle,
        },
      },
      update: {},
      create: {
        personaId: steve.id,
        platform: account.platform,
        handle: account.handle,
        authStatus: 'MANUAL',
      },
    });
  }

  const campaign = await prisma.campaign.upsert({
    where: { personaId_slug: { personaId: steve.id, slug: 'guidedgenius' } },
    update: {},
    create: {
      personaId: steve.id,
      name: 'GuidedGenius',
      slug: 'guidedgenius',
      status: 'ACTIVE',
      campaignType: 'APP_PROMOTION',
      objective:
        'Get views and engagement while making GuidedGenius feel useful, smart, and worth trying.',
      targetAudience: 'parents, students, teachers, edtech users',
      productName: 'GuidedGenius',
      productDescription:
        'An AI tutoring app that talks students through problems: asks, explains, adjusts, and never makes the child feel stupid.',
      productUrl: 'https://guidedgenius.com',
      directnessLevel: 'CASUAL',
      plugFrequency: 'CUSTOM_PERCENTAGE',
      plugPercentage: 60,
      mainMessage: 'Learning should be interactive, adaptive, and less boring.',
      productLine:
        `"I've been using this app called GuidedGenius, and damn, it's awesome. I'm not even the target audience."`,
      primaryKpi: 'VIEWS',
      secondaryKpis: ['ENGAGEMENT', 'CLICKS'],
    },
  });

  await prisma.guardrailConfig.upsert({
    where: { campaignId: campaign.id },
    update: {},
    create: {
      campaignId: campaign.id,
      allowedTopics: [
        'education',
        'learning',
        'edtech',
        'student motivation',
        'AI tutoring',
      ],
      bannedTopics: ['medical claims', 'guaranteed academic outcomes', 'personal attacks'],
      allowedClaims: [
        'GuidedGenius helps make learning interactive.',
        'GuidedGenius can help explain concepts.',
      ],
      bannedClaims: [
        'guaranteed marks improvement',
        'replaces all teachers',
        'works for every child',
      ],
      requiredDisclosures: [
        'Use platform-native AI/synthetic media labels where available.',
      ],
      competitorRules: { allowCompetitorMentions: false },
      aggressionLevel: 'NORMAL',
      escalationRules: {
        rules: ['If user asks legal/medical/sensitive question, escalate to human.'],
      },
    },
  });

  const schedules = [
    {
      platform: 'YOUTUBE',
      contentType: 'SHORT_VIDEO',
      cadenceType: 'CRON',
      cronExpression: '0 19 * * *',
      intervalMinutes: null as number | null,
    },
    {
      platform: 'X',
      contentType: 'TEXT_POST',
      cadenceType: 'INTERVAL',
      cronExpression: null as string | null,
      intervalMinutes: 720,
    },
  ] as const;

  for (const schedule of schedules) {
    const existing = await prisma.contentSchedule.findFirst({
      where: {
        campaignId: campaign.id,
        platform: schedule.platform,
        contentType: schedule.contentType,
      },
    });
    if (!existing) {
      await prisma.contentSchedule.create({
        data: {
          campaignId: campaign.id,
          platform: schedule.platform,
          contentType: schedule.contentType,
          cadenceType: schedule.cadenceType,
          cronExpression: schedule.cronExpression,
          intervalMinutes: schedule.intervalMinutes,
          timezone: 'UTC',
          isActive: true,
          nextRunAt: new Date(),
        },
      });
    }
  }

  return { owner, steve, campaign };
}

const isMain = process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js');
if (isMain) {
  seed()
    .then(async ({ steve, campaign }) => {
      console.log(`Seeded persona "${steve.name}" with campaign "${campaign.name}".`);
      await disconnectPrisma();
    })
    .catch(async (err) => {
      console.error(err);
      await disconnectPrisma();
      process.exit(1);
    });
}
