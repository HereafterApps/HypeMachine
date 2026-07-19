"""HypeMachine pipeline service (build-spec §4.1/§4.4 `apps/api/pipeline`).

Owns the plan → generate → guardrail-check stages plus learning insights.
The TypeScript control-plane API (DB, approvals, publishing, scheduling)
calls this service over HTTP with a shared bearer token.
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request


def _load_dotenv() -> None:
    """Minimal .env loader (no dependency): repo root first, then local.

    Existing environment variables always win; values are only defaulted.
    Lets `pnpm dev:pipeline` pick up LLM_PROVIDER / ANTHROPIC_API_KEY /
    PIPELINE_TOKEN from the same root .env the TS API uses.
    """
    here = Path(__file__).resolve()
    # parents[3] = repo root, parents[1] = apps/pipeline
    for candidate in (here.parents[3] / ".env", here.parents[1] / ".env"):
        if not candidate.is_file():
            continue
        for line in candidate.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()

if os.environ.get("PIPELINE_TOKEN", "dev-pipeline-token") == "dev-pipeline-token":
    print(
        "WARNING: PIPELINE_TOKEN is unset or the well-known dev default - "
        "set a strong token before exposing this service beyond localhost."
    )

from .guardrails import run_guardrails  # noqa: E402
from .prompts import (
    OUTPUT_KIND_MARKER,
    build_campaign_context,
    build_generation_prompt,
    build_platform_context,
    build_system_prompt,
)
from .providers import GenerationError, create_provider
from .schemas import (
    ContentFields,
    EvaluateRequest,
    GenerateRequest,
    GenerateResponse,
    GuardrailResult,
    InsightsRequest,
    InsightsResponse,
    LearningInsightPlan,
    ReplyPlan,
    ShortVideoPlan,
    TextPostPlan,
)

app = FastAPI(title="HypeMachine Pipeline", version="0.1.0")
provider = create_provider()


def require_token(request: Request) -> None:
    expected = os.environ.get("PIPELINE_TOKEN", "dev-pipeline-token")
    provided = request.headers.get("authorization", "")
    if not secrets.compare_digest(provided, f"Bearer {expected}"):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "provider": provider.name}


@app.post("/generate", response_model=GenerateResponse, dependencies=[Depends(require_token)])
def generate(request: GenerateRequest) -> GenerateResponse:
    system_prompt = build_system_prompt(request.persona)
    campaign_context = build_campaign_context(
        request.campaign,
        allowed_claims=request.policy.allowedClaims,
        banned_claims=request.policy.bannedClaims,
        banned_topics=request.policy.bannedTopics,
    )
    user_prompt = build_generation_prompt(
        campaign_context=campaign_context,
        platform_context=build_platform_context(request.platform, request.contentType),
        output_kind=request.outputKind,
        include_plug=request.includePlug,
        extra_instructions=request.extraInstructions,
        recent_summaries=request.recentSummaries,
    )

    try:
        fields, plug_type, risk_notes, citations, metadata, usage = _call_model(
            request, system_prompt, user_prompt
        )
    except GenerationError as error:
        raise HTTPException(
            status_code=422 if not error.retryable else 503, detail=str(error)
        ) from error
    except Exception as error:  # SDK/auth/rate-limit/parse errors: retryable to the caller
        raise HTTPException(status_code=503, detail=f"LLM provider error: {error}") from error

    guardrails = run_guardrails(
        request.policy,
        platform=request.platform,
        texts=[
            ("title", fields.title or ""),
            ("hook", fields.hook or ""),
            ("script", fields.script or ""),
            ("caption", fields.caption or ""),
            ("body", fields.bodyText or ""),
            ("cta", fields.cta or ""),
        ],
        hashtags=fields.hashtags,
        campaign_plug_type=plug_type,
        risk_notes=risk_notes,
        source_citations=citations,
        recent_texts=request.recentTexts,
        content_kind=request.contentType,
    )

    return GenerateResponse(
        fields=fields,
        plugType=plug_type,  # type: ignore[arg-type]
        riskNotes=risk_notes,
        sourceCitations=citations,
        metadata=metadata,
        usage=usage,
        guardrails=guardrails,
        generationPrompt=user_prompt,
    )


def _call_model(request: GenerateRequest, system_prompt: str, user_prompt: str):
    kind = request.outputKind
    if kind == "SHORT_VIDEO":
        plan, usage = provider.generate_structured(
            system_prompt=system_prompt, user_prompt=user_prompt, schema=ShortVideoPlan
        )
        fields = ContentFields(
            title=plan.title,
            hook=plan.hook,
            script=plan.script,
            caption=plan.caption,
            hashtags=plan.hashtags,
            cta=plan.cta,
        )
        metadata = {
            "visualDirection": plan.visualDirection,
            "cameraStyle": plan.cameraStyle,
            "outfitSuggestion": plan.outfitSuggestion,
            "brollPlan": [b.model_dump() for b in plan.brollPlan],
            "thumbnailIdea": plan.thumbnailIdea,
            "whyThisShouldWork": plan.whyThisShouldWork,
        }
        return fields, plan.campaignPlugType, plan.riskNotes, plan.sourceCitations, metadata, usage

    if kind in ("TEXT_POST", "THREAD"):
        plan, usage = provider.generate_structured(
            system_prompt=system_prompt, user_prompt=user_prompt, schema=TextPostPlan
        )
        fields = ContentFields(
            hook=plan.hook, bodyText=plan.body, hashtags=plan.hashtags, cta=plan.cta
        )
        metadata = {"whyThisShouldWork": plan.whyThisShouldWork}
        return fields, plan.campaignPlugType, plan.riskNotes, plan.sourceCitations, metadata, usage

    # REPLY / DM_REPLY / WHATSAPP_MESSAGE (own posts / opted-in only)
    plan, usage = provider.generate_structured(
        system_prompt=system_prompt, user_prompt=user_prompt, schema=ReplyPlan
    )
    fields = ContentFields(bodyText=plan.reply, hashtags=[])
    if plan.escalateToHuman:
        risk_notes = [f"Escalate to human: {plan.reason}"]
    elif plan.riskLevel != "LOW":
        risk_notes = [f"Model risk level {plan.riskLevel}: {plan.reason}"]
    else:
        risk_notes = []
    metadata = {
        "tone": plan.tone,
        "escalateToHuman": plan.escalateToHuman,
        "reason": plan.reason,
    }
    plug = "CASUAL" if plan.shouldMentionCampaign else "NONE"
    return fields, plug, risk_notes, [], metadata, usage


@app.post("/evaluate", response_model=GuardrailResult, dependencies=[Depends(require_token)])
def evaluate(request: EvaluateRequest) -> GuardrailResult:
    return run_guardrails(
        request.policy,
        platform=request.platform,
        texts=[
            ("title", request.title or ""),
            ("hook", request.hook or ""),
            ("script", request.script or ""),
            ("caption", request.caption or ""),
            ("body", request.bodyText or ""),
            ("cta", request.cta or ""),
        ],
        hashtags=request.hashtags,
        campaign_plug_type=request.campaignPlugType,
        risk_notes=request.riskNotes,
        source_citations=request.sourceCitations,
        recent_texts=request.recentTexts,
        content_kind=request.contentType,
    )


@app.post("/insights", response_model=InsightsResponse, dependencies=[Depends(require_token)])
def insights(request: InsightsRequest) -> InsightsResponse:
    mission = request.optimizationTarget in ("CLARITY", "COMPLETION")
    optimization_instruction = (
        f"This campaign optimizes for {request.optimizationTarget} (mission metric). Do NOT "
        "recommend maximizing raw engagement, reach, or outrage — evaluate what improved "
        "clarity/completion, even at the cost of views."
        if mission
        else f"This campaign optimizes for {request.optimizationTarget}."
    )
    user_prompt = "\n".join(
        [
            "Analyze this campaign's published content performance and produce ONE actionable learning insight.",
            f"Campaign: {request.campaignName} — {request.objective}",
            optimization_instruction,
            "Performance:",
            *request.performanceLines,
            "",
            f"{OUTPUT_KIND_MARKER} LEARNING_INSIGHT",
        ]
    )
    try:
        plan, usage = provider.generate_structured(
            system_prompt=build_system_prompt(request.persona),
            user_prompt=user_prompt,
            schema=LearningInsightPlan,
        )
    except GenerationError as error:
        raise HTTPException(
            status_code=422 if not error.retryable else 503, detail=str(error)
        ) from error
    except Exception as error:
        raise HTTPException(status_code=503, detail=f"LLM provider error: {error}") from error
    return InsightsResponse(insight=plan, usage=usage)
