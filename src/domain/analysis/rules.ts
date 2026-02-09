import type { AnalysisFinding, TurnAdvice } from "@/domain/analysis/types";
import type { ReplayModel, ReplayTurn } from "@/domain/replay/types";

function findingId(prefix: string, turn: number): string {
  return `${prefix}-turn-${turn}`;
}

function toTurnAdvice(finding: AnalysisFinding): TurnAdvice {
  return {
    turnNumber: finding.turnNumber ?? 0,
    happened: finding.title,
    riskyBecause: finding.detail,
    saferAlternative: finding.recommendation,
    confidence: finding.severity === "high" ? "high" : finding.severity === "medium" ? "medium" : "low",
    evidence: finding.evidence
  };
}

export function evaluateTurnoverCause(replay: ReplayModel): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    if (!turn.possibleTurnover) {
      continue;
    }

    const likelyCauseEvent =
      turn.events.find((event) => event.type === "dodge") ??
      turn.events.find((event) => event.type === "block") ??
      turn.events.find((event) => event.type === "ball_state");

    findings.push({
      id: findingId("turnover-cause", turn.turnNumber),
      severity: "high",
      category: "turnover_cause",
      title: `Turn ${turn.turnNumber} ended early`,
      detail:
        likelyCauseEvent !== undefined
          ? `Your turn stopped after a risky play around ${likelyCauseEvent.sourceTag}.`
          : "Your turn stopped before you finished your plan.",
      recommendation: "Make your safest moves first, then do risky dice actions at the end of the turn.",
      turnNumber: turn.turnNumber,
      evidence: [
        {
          eventType: likelyCauseEvent?.type,
          sourceTag: likelyCauseEvent?.sourceTag,
          code: turn.endTurnReasonLabel ?? String(turn.endTurnReason ?? "unknown")
        }
      ]
    });
  }

  return findings;
}

function hasRiskyActionBeforeBallSafety(turn: ReplayTurn): boolean {
  const firstBallIndex = turn.events.findIndex((event) => event.type === "ball_state");
  if (firstBallIndex <= 0) {
    return false;
  }

  return turn.events.slice(0, firstBallIndex).some((event) => event.type === "dodge" || event.type === "block" || event.type === "blitz");
}

export function evaluateActionOrdering(replay: ReplayModel): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    if (!hasRiskyActionBeforeBallSafety(turn)) {
      continue;
    }

    findings.push({
      id: findingId("action-order", turn.turnNumber),
      severity: "medium",
      category: "action_ordering",
      title: `Turn ${turn.turnNumber}: risky moves came too early`,
      detail: "You took risky actions before securing the ball or key player positions.",
      recommendation: "Start with safe movement and ball protection, then do blocks, blitzes, and dodges.",
      turnNumber: turn.turnNumber,
      evidence: turn.events.slice(0, 3).map((event) => ({
        eventType: event.type,
        sourceTag: event.sourceTag,
        code: event.actionLabel ?? event.stepLabel
      }))
    });
  }

  return findings;
}

export function evaluateRerollTiming(replay: ReplayModel): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    const rerollEvents = turn.events.filter((event) => event.type === "reroll");
    if (rerollEvents.length === 0) {
      continue;
    }

    const riskyEvents = turn.events.filter((event) => event.type === "dodge" || event.type === "block" || event.type === "blitz");
    if (riskyEvents.length <= rerollEvents.length) {
      continue;
    }

    findings.push({
      id: findingId("reroll-timing", turn.turnNumber),
      severity: "medium",
      category: "reroll_timing",
      title: `Turn ${turn.turnNumber}: rerolls were under pressure`,
      detail: "You had to spend rerolls during risky actions, which can leave you exposed later in the turn.",
      recommendation: "Use safe actions first so you can save rerolls for the most important dice rolls.",
      turnNumber: turn.turnNumber,
      evidence: rerollEvents.slice(0, 2).map((event) => ({
        eventType: event.type,
        sourceTag: event.sourceTag,
        code: event.actionLabel ?? event.stepLabel
      }))
    });
  }

  return findings;
}

export function evaluateBallSafety(replay: ReplayModel): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  let previousCarrier: string | undefined;

  for (const turn of replay.turns) {
    if (turn.ballCarrierPlayerId && previousCarrier && turn.ballCarrierPlayerId !== previousCarrier) {
      findings.push({
        id: findingId("ball-safety", turn.turnNumber),
        severity: "medium",
        category: "ball_safety",
        title: `Turn ${turn.turnNumber}: ball carrier changed`,
        detail: "The ball moved to a new player. This can be risky if that player is not well protected.",
        recommendation: "Before handing off or moving the ball, make sure nearby players can protect the new carrier.",
        turnNumber: turn.turnNumber,
        evidence: [
          {
            eventType: "ball_state",
            sourceTag: "Carrier",
            detail: `carrier:${previousCarrier}->${turn.ballCarrierPlayerId}`
          }
        ]
      });
    }

    if (turn.ballCarrierPlayerId) {
      previousCarrier = turn.ballCarrierPlayerId;
    }
  }

  return findings;
}

export function findingsToTurnAdvice(findings: AnalysisFinding[]): TurnAdvice[] {
  return findings
    .filter((finding) => finding.turnNumber !== undefined)
    .map(toTurnAdvice)
    .sort((a, b) => a.turnNumber - b.turnNumber)
    .slice(0, 16);
}
