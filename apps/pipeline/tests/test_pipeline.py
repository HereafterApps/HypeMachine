import os

os.environ.setdefault("PIPELINE_TOKEN", "test-pipeline-token")
os.environ.setdefault("LLM_PROVIDER", "stub")

from fastapi.testclient import TestClient  # noqa: E402

from hype_pipeline.guardrails import run_guardrails, text_similarity  # noqa: E402
from hype_pipeline.main import app  # noqa: E402
from hype_pipeline.schemas import GuardrailPolicy  # noqa: E402

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-pipeline-token"}

PERSONA = {
    "name": "Professor Steve",
    "backstory": "Retired professor.",
    "worldview": "Learning should be interactive.",
    "speakingStyle": "short sentences",
    "tone": "warm, blunt",
    "humorStyle": "dry",
    "disclosureText": "Virtual AI-driven professor character.",
    "memoryHighlights": [{"type": "RECURRING_JOKE", "content": "Not even the target audience."}],
}

CAMPAIGN = {
    "name": "GuidedGenius",
    "campaignType": "PRODUCT_HYPE",
    "objective": "Awareness",
    "productName": "GuidedGenius",
    "directnessLevel": "CASUAL",
    "plugFrequency": "CUSTOM_PERCENTAGE",
    "plugPercentage": 60,
    "sources": [{"type": "PRODUCT_DOC", "title": "Overview", "content": "Tutoring app."}],
    "learnings": [],
}

POLICY = {
    "campaignType": "PRODUCT_HYPE",
    "bannedTopics": ["medical claims"],
    "allowedClaims": ["GuidedGenius helps make learning interactive."],
    "bannedClaims": ["guaranteed marks improvement"],
    "competitorNames": ["TutorBot"],
    "directnessLevel": "CASUAL",
}


def generate_payload(**overrides):
    payload = {
        "outputKind": "TEXT_POST",
        "platform": "X",
        "contentType": "TEXT_POST",
        "persona": PERSONA,
        "campaign": CAMPAIGN,
        "policy": POLICY,
        "recentSummaries": [],
        "recentTexts": [],
    }
    payload.update(overrides)
    return payload


def test_health_and_auth():
    assert client.get("/health").json()["ok"] is True
    assert client.post("/generate", json=generate_payload()).status_code == 401


def test_generate_text_post():
    response = client.post("/generate", json=generate_payload(), headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body["fields"]["bodyText"]
    assert body["guardrails"]["passed"] is True
    assert "## Output kind: TEXT_POST" in body["generationPrompt"]


def test_generate_short_video_has_storyboard_metadata():
    response = client.post(
        "/generate",
        json=generate_payload(outputKind="SHORT_VIDEO", contentType="SHORT_VIDEO", platform="YOUTUBE"),
        headers=AUTH,
    )
    body = response.json()
    assert body["fields"]["script"]
    assert body["metadata"]["brollPlan"]


def test_debunk_generation_cites_and_prompt_carries_rules():
    campaign = {**CAMPAIGN, "campaignType": "DEBUNK", "subject": "edited clip"}
    policy = {**POLICY, "campaignType": "DEBUNK"}
    response = client.post(
        "/generate",
        json=generate_payload(
            campaign=campaign,
            policy=policy,
            extraInstructions='The specific claim to debunk (human-selected): "the clip shows a full lesson"',
            includePlug=False,
        ),
        headers=AUTH,
    )
    body = response.json()
    assert body["sourceCitations"]
    assert "DEBUNK rules" in body["generationPrompt"]
    assert any("Reviewer must confirm" in w for w in body["guardrails"]["warnings"])


def test_evaluate_blocks_advocacy_and_missing_citations():
    base = {
        "policy": {**POLICY, "campaignType": "DEBUNK"},
        "platform": "X",
        "bodyText": "The clip is edited — so vote against the measure.",
        "hashtags": [],
        "sourceCitations": ["https://example.org/raw"],
    }
    result = client.post("/evaluate", json=base, headers=AUTH).json()
    assert result["passed"] is False
    assert any("advocacy" in b.lower() for b in result["blockers"])

    no_citation = {**base, "bodyText": "That claim is false, trust me.", "sourceCitations": []}
    result = client.post("/evaluate", json=no_citation, headers=AUTH).json()
    assert any("primary source" in b for b in result["blockers"])


def test_evaluate_x_length_limit():
    result = client.post(
        "/evaluate",
        json={"policy": POLICY, "platform": "X", "bodyText": "x" * 300, "hashtags": []},
        headers=AUTH,
    ).json()
    assert any("exceeds X limit" in b for b in result["blockers"])


def test_insights_mission_constraint_in_prompt():
    response = client.post(
        "/insights",
        json={
            "persona": PERSONA,
            "campaignName": "Debunks",
            "objective": "Debunk claims",
            "optimizationTarget": "CLARITY",
            "performanceLines": ["- [TEXT_POST/X] views=100 engagement=2% missionMetric=0.8"],
        },
        headers=AUTH,
    )
    assert response.status_code == 200
    assert 0 <= response.json()["insight"]["confidence"] <= 1


def test_debunk_replies_exempt_from_citation_rule_but_not_advocacy():
    policy = {**POLICY, "campaignType": "DEBUNK"}
    # A reply without citations must be approvable…
    result = client.post(
        "/evaluate",
        json={
            "policy": policy,
            "platform": "X",
            "contentType": "REPLY",
            "bodyText": "Thanks — the full recording is linked in the original post.",
            "hashtags": [],
        },
        headers=AUTH,
    ).json()
    assert not any("primary source" in b for b in result["blockers"])
    # …but advocacy in a reply is still blocked.
    result = client.post(
        "/evaluate",
        json={
            "policy": policy,
            "platform": "X",
            "contentType": "REPLY",
            "bodyText": "Exactly, which is why you should oppose the measure.",
            "hashtags": [],
        },
        headers=AUTH,
    ).json()
    assert result["passed"] is False


def test_hashtags_are_scanned_and_junk_citations_rejected():
    result = client.post(
        "/evaluate",
        json={
            "policy": POLICY,
            "platform": "X",
            "bodyText": "Great study session today.",
            "hashtags": ["#TutorBot"],
        },
        headers=AUTH,
    ).json()
    assert any("competitor" in b.lower() for b in result["blockers"])

    result = client.post(
        "/evaluate",
        json={
            "policy": {**POLICY, "campaignType": "DEBUNK"},
            "platform": "X",
            "contentType": "TEXT_POST",
            "bodyText": "That claim is false.",
            "hashtags": [],
            "sourceCitations": ["", "n/a"],
        },
        headers=AUTH,
    ).json()
    assert any("primary source" in b for b in result["blockers"])


def test_escalation_flag_raises_risk_above_low():
    result = client.post(
        "/evaluate",
        json={
            "policy": POLICY,
            "platform": "X",
            "contentType": "REPLY",
            "bodyText": "Let me get back to you on that legal question.",
            "hashtags": [],
            "riskNotes": ["Escalate to human: legal question from audience"],
        },
        headers=AUTH,
    ).json()
    assert result["riskLevel"] != "LOW"


def test_guardrails_engine_direct():
    policy = GuardrailPolicy(**{**POLICY, "campaignType": "PRODUCT_HYPE"})
    result = run_guardrails(
        policy,
        platform="X",
        texts=[("body", "Vote for your favorite flavor in the replies!")],
        hashtags=[],
        campaign_plug_type="CASUAL",
        risk_notes=[],
        source_citations=[],
        recent_texts=[],
    )
    assert result.passed is True  # advocacy checks scoped to political missions

    assert text_similarity("a b c d e f", "a b c d e f") == 1.0
