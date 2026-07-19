/** Thin API client. Token + base URL configurable in Settings (localStorage). */

export function apiConfig() {
  return {
    baseUrl: localStorage.getItem('hype.apiUrl') ?? '/api',
    token: localStorage.getItem('hype.apiToken') ?? 'change-me',
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { baseUrl, token } = apiConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body (proxy error page etc.) — fall through to status message.
  }
  if (!response.ok) {
    const detail =
      data?.issues?.length
        ? `${data.error}: ${data.issues.map((i: any) => `${i.path?.join('.')} ${i.message}`).join('; ')}`
        : data?.error;
    throw new ApiError(detail ?? `${response.status} ${response.statusText}`, response.status);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
};

// ---------- shapes (mirror the API responses we consume) ----------

export interface Persona {
  id: string;
  name: string;
  slug: string;
  status: string;
  personaType: string;
  description: string;
  disclosureText: string;
  campaigns?: { id: string; name: string; status: string }[];
  platformAccounts?: { platform: string; handle: string; authStatus: string }[];
}

export interface Campaign {
  id: string;
  personaId: string;
  name: string;
  slug: string;
  status: string;
  campaignType: string;
  subject?: string | null;
  objective: string;
  optimizationTarget: string;
  productName?: string | null;
  directnessLevel: string;
  plugFrequency: string;
  plugPercentage?: number | null;
  persona?: { name: string; slug: string };
  schedules?: Schedule[];
  _count?: { generatedContent: number };
}

export interface Schedule {
  id: string;
  platform: string;
  contentType: string;
  cadenceType: string;
  intervalMinutes?: number | null;
  cronExpression?: string | null;
  isActive: boolean;
}

export interface ChecklistItem {
  label: string;
  passed: boolean;
  detail?: string;
}

export interface GuardrailResult {
  passed: boolean;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  warnings: string[];
  blockers: string[];
  requiredEdits: string[];
  checklist: ChecklistItem[];
}

export interface ContentItem {
  id: string;
  platform: string;
  contentType: string;
  status: string;
  title?: string | null;
  hook?: string | null;
  script?: string | null;
  caption?: string | null;
  bodyText?: string | null;
  hashtags: string[];
  cta?: string | null;
  sourceCitations: string[];
  riskScore?: number | null;
  guardrailResult?: GuardrailResult | null;
  scheduledFor?: string | null;
  createdAt: string;
  persona?: { name: string };
  campaign?: { name: string };
}

export interface PublishedPost {
  id: string;
  platform: string;
  platformPostId: string;
  platformUrl?: string | null;
  publishedAt: string;
  generatedContentId: string;
  generatedContent?: {
    contentType: string;
    title?: string | null;
    hook?: string | null;
    persona?: { name: string };
    campaign?: { name: string };
  };
  snapshots?: {
    views: number;
    engagementRate: number;
    missionMetric?: number | null;
  }[];
}

export interface Insight {
  id: string;
  insight: string;
  evidence: string;
  confidence: number;
  actionRecommendation: string;
  createdAt: string;
}
