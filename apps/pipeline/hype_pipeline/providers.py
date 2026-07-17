"""LLM providers: Anthropic Claude structured outputs + deterministic stub.

Select via LLM_PROVIDER=anthropic|stub (default stub — keyless dev/tests).
"""
from __future__ import annotations

import json
import os
import re
from typing import Protocol, Type, TypeVar

from pydantic import BaseModel

from .prompts import OUTPUT_KIND_MARKER
from .schemas import LearningInsightPlan, ReplyPlan, ShortVideoPlan, TextPostPlan, Usage

T = TypeVar("T", bound=BaseModel)

# $ per million tokens; approximate cost tracking (product-plan §25).
PRICING = {
    "claude-opus-4-8": (5.0, 25.0),
    "claude-sonnet-5": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
}


class GenerationError(Exception):
    def __init__(self, message: str, retryable: bool):
        super().__init__(message)
        self.retryable = retryable


class LlmProvider(Protocol):
    name: str

    def generate_structured(
        self, *, system_prompt: str, user_prompt: str, schema: Type[T], max_tokens: int = 16000
    ) -> tuple[T, Usage]: ...


class AnthropicProvider:
    """Claude with structured outputs (adaptive thinking, no sampling params)."""

    name = "anthropic"

    def __init__(self, model: str | None = None):
        from anthropic import Anthropic

        self._client = Anthropic()
        self._model = model or os.environ.get("ANTHROPIC_MODEL", "claude-opus-4-8")

    def generate_structured(
        self, *, system_prompt: str, user_prompt: str, schema: Type[T], max_tokens: int = 16000
    ) -> tuple[T, Usage]:
        response = self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            thinking={"type": "adaptive"},
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            output_config={
                "format": {"type": "json_schema", "schema": schema.model_json_schema()}
            },
        )
        if response.stop_reason == "refusal":
            raise GenerationError("Model refused the generation request.", retryable=False)
        if response.stop_reason == "max_tokens":
            raise GenerationError("Generation hit max_tokens before completing.", retryable=True)

        text = next(
            (block.text for block in response.content if block.type == "text"), None
        )
        if text is None:
            raise GenerationError("Model returned no text content.", retryable=True)
        data = schema.model_validate(json.loads(text))

        input_price, output_price = PRICING.get(self._model, (5.0, 25.0))
        usage = Usage(
            inputTokens=response.usage.input_tokens,
            outputTokens=response.usage.output_tokens,
            costUsd=(response.usage.input_tokens / 1_000_000) * input_price
            + (response.usage.output_tokens / 1_000_000) * output_price,
        )
        return data, usage


class StubProvider:
    """Deterministic keyless provider (port of the original TS stub).

    Keys off the output-kind marker; a counter varies text posts so duplicate
    detection stays meaningful. DEBUNK campaigns are detected via the
    "Type: DEBUNK" line the campaign context always includes.
    """

    name = "stub"

    def __init__(self) -> None:
        self._counter = 0

    def generate_structured(
        self, *, system_prompt: str, user_prompt: str, schema: Type[T], max_tokens: int = 16000
    ) -> tuple[T, Usage]:
        match = re.search(rf"{re.escape(OUTPUT_KIND_MARKER)}\s*(\w+)", user_prompt)
        kind = match.group(1) if match else None
        self._counter += 1
        is_debunk = re.search(r"^Type: DEBUNK$", user_prompt, re.M) is not None

        raw: BaseModel
        if kind == "SHORT_VIDEO":
            raw = self._short_video(is_debunk)
        elif kind in ("TEXT_POST", "THREAD"):
            raw = self._debunk_post(user_prompt) if is_debunk else self._text_post()
        elif kind in ("REPLY", "DM_REPLY", "WHATSAPP_MESSAGE"):
            raw = self._reply()
        elif kind == "LEARNING_INSIGHT":
            raw = self._insight()
        else:
            raise GenerationError(
                f'Stub provider cannot infer output kind from prompt (marker "{OUTPUT_KIND_MARKER}" missing).',
                retryable=False,
            )
        return schema.model_validate(raw.model_dump()), Usage()

    def _short_video(self, is_debunk: bool) -> ShortVideoPlan:
        hooks = [
            "I'm 80 years old and I just found an app that teaches better than half the textbooks I grew up with.",
            "Fifty years of teaching, and a phone app just made me jealous.",
            'We used to call throwing chalk "interactive learning". This is better.',
        ]
        n = self._counter
        return ShortVideoPlan(
            title=f"I'm 80 and this learning app made me jealous (take {n})",
            hook=hooks[n % len(hooks)],
            script=(
                'You know what we used to call "interactive learning"? A teacher throwing chalk at the board '
                "and hoping the child stayed awake.\n\nNow I'm looking at this thing called GuidedGenius, and it "
                "actually talks the student through the problem. It asks, explains, adjusts, and doesn't make "
                "the child feel stupid.\n\nAnd listen, I'm not even the target audience. I'm an old man with a "
                "suspicious relationship with technology.\n\nBut if I had this when I was teaching? Good grief. "
                "I would've saved thousands of hours."
            ),
            caption="Professor Steve discovers GuidedGenius and gets mildly offended that students have better tools now.",
            hashtags=["#learning", "#edtech", "#studytok"],
            cta="Try GuidedGenius if you want learning to feel less passive.",
            visualDirection="Steve at webcam. Cut to app screen recording. Cut back to Steve squinting. Add captions. Add subtle zooms.",
            cameraStyle="WEBCAM_DESK",
            outfitSuggestion="brown cardigan over checked shirt",
            brollPlan=[
                {
                    "timestamp": "0:05-0:12",
                    "description": "GuidedGenius app screen recording, student solving a problem",
                    "source": "SCREEN_RECORDING",
                },
                {
                    "timestamp": "0:18-0:22",
                    "description": "Close-up of app explaining a concept step by step",
                    "source": "SCREEN_RECORDING",
                },
            ],
            thumbnailIdea='Steve squinting at a phone, caption "THIS teaches better than I did?!"',
            campaignPlugType="NONE" if is_debunk else "CASUAL",
            whyThisShouldWork="Contrast of an 80-year-old professor praising new tech is inherently shareable; the plug is native to the story.",
            riskNotes=[],
            sourceCitations=["https://example.org/primary-source"] if is_debunk else [],
        )

    def _text_post(self) -> TextPostPlan:
        # Kept under X's 280-char limit including hashtags.
        bodies = [
            "Taught for 50 years. The best students asked questions. GuidedGenius asks the student questions instead of lecturing. Took us half a century to put that in an app.",
            'Hot take from an old man: a dead PDF is not "digital learning". It\'s a paper worksheet with extra steps. Interactive means the material responds to the student.',
            "A student's confusion is data, not failure. Tools that adapt to confusion beat tools that grade it.",
        ]
        n = self._counter
        return TextPostPlan(
            body=bodies[n % len(bodies)],
            hook="Taught for 50 years — here's what actually made students learn.",
            cta="Learning should talk back. guidedgenius.com" if n % 2 == 0 else "",
            hashtags=["#education", "#learning"],
            campaignPlugType="NONE" if n % 3 == 1 else "CASUAL",
            whyThisShouldWork="Credibility of a veteran teacher plus a mildly contrarian framing drives replies.",
            riskNotes=[],
            sourceCitations=[],
        )

    def _debunk_post(self, user_prompt: str) -> TextPostPlan:
        claim_match = re.search(r'claim[^:]*:\s*"([^"]+)"', user_prompt, re.I)
        claim = claim_match.group(1) if claim_match else "the claim in question"
        return TextPostPlan(
            body=(
                f"Seen the claim that {claim}? I checked the original source. The claim doesn't hold up: "
                "the primary record says otherwise. Judge the evidence yourself — link below."
            ),
            hook="That viral claim? I read the original source.",
            cta="",
            hashtags=[],
            campaignPlugType="NONE",
            whyThisShouldWork="Calm, source-first correction; no side-taking.",
            riskNotes=[],
            sourceCitations=["https://example.org/primary-source"],
        )

    def _reply(self) -> ReplyPlan:
        return ReplyPlan(
            reply=(
                "Ha! Fair question. No, I don't get paid every time I say it — I just genuinely think staring at "
                "a dead PDF is a waste of a young brain. Try it yourself and argue with me after."
            ),
            tone="warm, amused, direct",
            shouldMentionCampaign=False,
            campaignMention="",
            riskLevel="LOW",
            escalateToHuman=False,
            reason="Benign audience banter on own post; no sensitive topic detected.",
        )

    def _insight(self) -> LearningInsightPlan:
        return LearningInsightPlan(
            insight="Videos where Steve reacts to the app UI on screen outperform pure talking-head videos.",
            evidence="Screen-recording b-roll posts averaged higher engagement rate than talking-head-only posts in the compared sample.",
            confidence=0.76,
            actionRecommendation="Include at least one app screen-recording b-roll segment in future short videos.",
        )


def create_provider(kind: str | None = None) -> LlmProvider:
    selected = kind or os.environ.get("LLM_PROVIDER", "stub")
    if selected == "anthropic":
        return AnthropicProvider()
    if selected == "stub":
        return StubProvider()
    raise ValueError(f"Unknown LLM provider: {selected}")
