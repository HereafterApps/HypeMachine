export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

/** Engagement rate = interactions / views, as a percentage with 2dp. */
export function engagementRate(metrics: {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}): number {
  if (metrics.views <= 0) return 0;
  const interactions =
    metrics.likes + metrics.comments + metrics.shares + metrics.saves;
  return Math.round((interactions / metrics.views) * 10000) / 100;
}

export function riskLevelFromScore(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}
