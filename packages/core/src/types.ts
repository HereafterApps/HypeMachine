import type { Platform, RiskLevel } from './enums.js';

/** Result of running guardrail checks on a piece of content (§7.9). */
export interface GuardrailResult {
  passed: boolean;
  /** 0 (safe) – 100 (blocked). */
  riskScore: number;
  riskLevel: RiskLevel;
  warnings: string[];
  blockers: string[];
  requiredEdits: string[];
  /** Human-readable checklist rendered before approval (§19). */
  checklist: GuardrailChecklistItem[];
}

export interface GuardrailChecklistItem {
  label: string;
  passed: boolean;
  detail?: string;
}

/** Normalized metrics across every analytics provider (§12.1). */
export interface AnalyticsMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  engagementRate: number;
  sentimentScore?: number;
  raw?: unknown;
}

export interface PublishResult {
  platformPostId: string;
  platformUrl?: string;
  rawResponse: unknown;
}

export interface ApprovalNotification {
  contentId: string;
  personaName: string;
  campaignName: string;
  contentType: string;
  platform: Platform;
  hook: string;
  riskLevel: RiskLevel;
  scheduledFor?: Date | null;
  dashboardUrl: string;
}

export interface NotificationEvent {
  kind:
    | 'APPROVAL_REQUESTED'
    | 'PUBLISH_SUCCEEDED'
    | 'PUBLISH_FAILED'
    | 'JOB_FAILED'
    | 'ANALYTICS_MILESTONE';
  title: string;
  body: string;
  dashboardUrl?: string;
  approval?: ApprovalNotification;
}
