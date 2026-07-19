"""Pydantic models for the pipeline service.

These mirror the shared shapes in packages/core (zod). Content-plan models
use extra='forbid' so their JSON schema carries additionalProperties: false,
as required by Anthropic structured outputs. Keep fields constraint-free
(no min/max/pattern) — structured outputs reject those; semantic checks live
in validators or the guardrail engine instead.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------- LLM output plans (mirror packages/core content-schemas) ----------

BrollSource = Literal["AI_GENERATED", "USER_ASSET", "SCREEN_RECORDING", "STOCK"]
PlugType = Literal["NONE", "SUBTLE", "CASUAL", "DIRECT"]
RiskLevel = Literal["LOW", "MEDIUM", "HIGH"]


class BrollShot(StrictModel):
    timestamp: str
    description: str
    source: BrollSource


class ShortVideoPlan(StrictModel):
    title: str
    hook: str
    script: str
    caption: str
    hashtags: list[str]
    cta: str
    visualDirection: str
    cameraStyle: str
    outfitSuggestion: str
    brollPlan: list[BrollShot]
    thumbnailIdea: str
    campaignPlugType: PlugType
    whyThisShouldWork: str
    riskNotes: list[str]
    sourceCitations: list[str]


class TextPostPlan(StrictModel):
    body: str
    hook: str
    cta: str
    hashtags: list[str]
    campaignPlugType: PlugType
    whyThisShouldWork: str
    riskNotes: list[str]
    sourceCitations: list[str]


class ReplyPlan(StrictModel):
    reply: str
    tone: str
    shouldMentionCampaign: bool
    campaignMention: str
    riskLevel: RiskLevel
    escalateToHuman: bool
    reason: str


class LearningInsightPlan(StrictModel):
    insight: str
    evidence: str
    confidence: float
    actionRecommendation: str

    @field_validator("confidence")
    @classmethod
    def _clamp_confidence(cls, v: float) -> float:
        return max(0.0, min(1.0, v))


# ---------- Guardrails ----------

class GuardrailPolicy(BaseModel):
    campaignType: str
    allowedTopics: list[str] = []
    bannedTopics: list[str] = []
    allowedClaims: list[str] = []
    bannedClaims: list[str] = []
    requiredDisclosures: list[str] = []
    wordsToAvoid: list[str] = []
    allowCompetitorMentions: bool = False
    competitorNames: list[str] = []
    directnessLevel: str = "CASUAL"


class ChecklistItem(BaseModel):
    label: str
    passed: bool
    detail: Optional[str] = None


class GuardrailResult(BaseModel):
    passed: bool
    riskScore: int
    riskLevel: RiskLevel
    warnings: list[str]
    blockers: list[str]
    requiredEdits: list[str]
    checklist: list[ChecklistItem]


# ---------- API contract ----------

class PersonaContext(BaseModel):
    name: str
    backstory: str = ""
    worldview: str = ""
    speakingStyle: str = ""
    tone: str = ""
    humorStyle: str = ""
    disclosureText: str
    memoryHighlights: list[dict[str, str]] = []


class CampaignSource(BaseModel):
    type: str
    title: str
    content: str = ""


class CampaignContext(BaseModel):
    name: str
    campaignType: str
    objective: str = ""
    subject: Optional[str] = None
    productName: Optional[str] = None
    productDescription: Optional[str] = None
    productUrl: Optional[str] = None
    targetAudience: Optional[str] = None
    directnessLevel: str = "CASUAL"
    plugFrequency: str = "WHEN_NATURAL"
    plugPercentage: Optional[int] = None
    mainMessage: Optional[str] = None
    productLine: Optional[str] = None
    sources: list[CampaignSource] = []
    learnings: list[str] = []


OutputKind = Literal[
    "SHORT_VIDEO", "TEXT_POST", "THREAD", "REPLY", "DM_REPLY", "WHATSAPP_MESSAGE"
]


class GenerateRequest(BaseModel):
    outputKind: OutputKind
    platform: str
    contentType: str
    persona: PersonaContext
    campaign: CampaignContext
    policy: GuardrailPolicy
    includePlug: Optional[bool] = None
    extraInstructions: Optional[str] = None
    recentSummaries: list[str] = []
    recentTexts: list[str] = []


class ContentFields(BaseModel):
    title: Optional[str] = None
    hook: Optional[str] = None
    script: Optional[str] = None
    caption: Optional[str] = None
    bodyText: Optional[str] = None
    hashtags: list[str] = []
    cta: Optional[str] = None


class Usage(BaseModel):
    inputTokens: int = 0
    outputTokens: int = 0
    costUsd: float = 0.0


class GenerateResponse(BaseModel):
    fields: ContentFields
    plugType: PlugType
    riskNotes: list[str]
    sourceCitations: list[str]
    metadata: dict
    usage: Usage
    guardrails: GuardrailResult
    generationPrompt: str


class EvaluateRequest(BaseModel):
    policy: GuardrailPolicy
    platform: str
    contentType: str = ""
    title: Optional[str] = None
    hook: Optional[str] = None
    script: Optional[str] = None
    caption: Optional[str] = None
    bodyText: Optional[str] = None
    cta: Optional[str] = None
    hashtags: list[str] = []
    campaignPlugType: PlugType = "NONE"
    riskNotes: list[str] = []
    sourceCitations: list[str] = []
    recentTexts: list[str] = []


class InsightsRequest(BaseModel):
    persona: PersonaContext
    campaignName: str
    objective: str
    optimizationTarget: str = "REACH"
    performanceLines: list[str]


class InsightsResponse(BaseModel):
    insight: LearningInsightPlan
    usage: Usage
