import type { GuardrailConfigInput, GuardrailResult } from "@hype/core";

export interface GuardrailSubject {
  /** All user-visible text of the content item, concatenated. */
  text: string;
  /** Plug type the generator claims it used (NONE/SUBTLE/CASUAL/DIRECT). */
  campaignPlugType?: string;
  /** Risk notes emitted by the generator itself. */
  riskNotes?: string[];
  platform?: string;
}

function containsPhrase(lowerHaystack: string, phrase: string): boolean {
  return lowerHaystack.includes(phrase.toLowerCase().trim());
}

/**
 * Deterministic guardrail pass (plan §7.9). This intentionally runs *in
 * addition to* human approval, never instead of it — nothing publishes
 * without a human clicking approve (plan §1.3).
 */
export function runGuardrails(
  subject: GuardrailSubject,
  config: GuardrailConfigInput,
): GuardrailResult {
  const warnings: string[] = [];
  const blockers: string[] = [];
  const requiredEdits: string[] = [];
  // Lowercase once — every check below scans this same string.
  const text = subject.text.toLowerCase();

  for (const claim of config.bannedClaims) {
    if (claim && containsPhrase(text, claim)) {
      blockers.push(`Contains banned claim: "${claim}"`);
    }
  }

  for (const topic of config.bannedTopics) {
    if (topic && containsPhrase(text, topic)) {
      blockers.push(`Touches banned topic: "${topic}"`);
    }
  }

  for (const word of config.wordsToAvoid) {
    if (word && containsPhrase(text, word)) {
      warnings.push(`Uses avoided word/phrase: "${word}"`);
    }
  }

  for (const disclosure of config.requiredDisclosures) {
    // Disclosures configured as literal text must appear verbatim; rules that
    // read like instructions (contain spaces + no exact-match marker) are
    // surfaced as reminders for the human reviewer instead of hard-matched.
    if (disclosure.startsWith("text:")) {
      const literal = disclosure.slice("text:".length).trim();
      if (literal && !containsPhrase(text, literal)) {
        requiredEdits.push(`Missing required disclosure text: "${literal}"`);
      }
    } else {
      warnings.push(`Reviewer: verify disclosure rule — ${disclosure}`);
    }
  }

  if (!config.competitorRules.allowCompetitorMentions) {
    for (const name of config.competitorRules.competitorNames) {
      if (containsPhrase(text, name)) {
        blockers.push(`Mentions competitor "${name}" (mentions disabled)`);
      }
    }
  }

  for (const note of subject.riskNotes ?? []) {
    if (note.trim()) warnings.push(`Generator risk note: ${note}`);
  }

  // Simple risk score: blockers dominate, then required edits, then warnings.
  const riskScore = Math.min(
    1,
    blockers.length * 0.5 + requiredEdits.length * 0.2 + warnings.length * 0.05,
  );

  return {
    passed: blockers.length === 0 && requiredEdits.length === 0,
    riskScore,
    warnings,
    blockers,
    requiredEdits,
  };
}
