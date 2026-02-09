import type { AnalysisFinding, TeamContext, TurnAdvice } from "@/domain/analysis/types";
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
    confidence: confidenceFromSeverity(finding.severity),
    evidence: finding.evidence
  };
}

function confidenceFromSeverity(severity: AnalysisFinding["severity"]): TurnAdvice["confidence"] {
  if (severity === "high") {
    return "high";
  }

  if (severity === "medium") {
    return "medium";
  }

  return "low";
}

function contextRecommendation(context: TeamContext, options: { offense: string; defense: string; mixed: string }): string {
  if (context.mode === "offense") {
    return options.offense;
  }

  if (context.mode === "defense") {
    return options.defense;
  }

  return options.mixed;
}

function countEvents(turn: ReplayTurn, eventType: ReplayTurn["events"][number]["type"]): number {
  return turn.events.filter((event) => event.type === eventType).length;
}

function hasRiskyActionBeforeBallSafety(turn: ReplayTurn): boolean {
  const firstBallIndex = turn.events.findIndex((event) => event.type === "ball_state");
  if (firstBallIndex <= 0) {
    return false;
  }

  return turn.events.slice(0, firstBallIndex).some((event) => event.type === "dodge" || event.type === "block" || event.type === "blitz");
}

function toEvidenceFromTurn(turn: ReplayTurn, maxItems = 3): AnalysisFinding["evidence"] {
  return turn.events.slice(0, maxItems).map((event) => ({
    eventType: event.type,
    sourceTag: event.sourceTag,
    code: event.actionLabel ?? event.stepLabel
  }));
}

function limitFindings(findings: AnalysisFinding[], maxByCategory = 6): AnalysisFinding[] {
  const byCategory = new Map<string, number>();

  return findings.filter((finding) => {
    const count = byCategory.get(finding.category) ?? 0;
    if (count >= maxByCategory) {
      return false;
    }

    byCategory.set(finding.category, count + 1);
    return true;
  });
}

export function evaluateTurnoverCause(replay: ReplayModel, context: TeamContext): AnalysisFinding[] {
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
      recommendation: contextRecommendation(context, {
        offense: "Protect the ball first, then do risky dice actions at the end of your turn.",
        defense: "Mark key players first, then take risky dice actions at the end of your turn.",
        mixed: "Make safe moves first, then do risky dice actions at the end of your turn."
      }),
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

export function evaluateActionOrdering(replay: ReplayModel, context: TeamContext): AnalysisFinding[] {
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
      recommendation: contextRecommendation(context, {
        offense: "Start with safe movement and ball protection, then do blocks, blitzes, and dodges.",
        defense: "Set your screen and marks first, then do blocks, blitzes, and dodges.",
        mixed: "Start with safe movement first, then do risky dice actions."
      }),
      turnNumber: turn.turnNumber,
      evidence: toEvidenceFromTurn(turn)
    });
  }

  return limitFindings(findings);
}

export function evaluateRerollTiming(replay: ReplayModel, context: TeamContext): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    const rerollEvents = turn.events.filter((event) => event.type === "reroll");
    if (rerollEvents.length === 0) {
      continue;
    }

    const firstRerollIndex = turn.events.findIndex((event) => event.type === "reroll");
    if (firstRerollIndex < 0) {
      continue;
    }

    const riskyAfterReroll = turn.events
      .slice(firstRerollIndex + 1)
      .filter((event) => event.type === "dodge" || event.type === "block" || event.type === "blitz" || event.type === "foul").length;

    if (riskyAfterReroll < 2 && !turn.possibleTurnover) {
      continue;
    }

    findings.push({
      id: findingId("reroll-timing", turn.turnNumber),
      severity: turn.possibleTurnover ? "high" : "medium",
      category: "reroll_timing",
      title: `Turn ${turn.turnNumber}: reroll used before the hard part`,
      detail:
        riskyAfterReroll >= 3
          ? "You spent a reroll early, then still had several risky dice actions left."
          : "You used a reroll and still had risky actions left in the same turn.",
      recommendation: contextRecommendation(context, {
        offense: "Save rerolls for key ball actions like pickup, dodge, or score attempts.",
        defense: "Save rerolls for your key blitz or a turnover-saving roll.",
        mixed: "Do safe actions first so rerolls are saved for your most important roll."
      }),
      turnNumber: turn.turnNumber,
      evidence: [
        ...rerollEvents.slice(0, 2).map((event) => ({
          eventType: event.type,
          sourceTag: event.sourceTag,
          code: event.actionLabel ?? event.stepLabel
        })),
        {
          detail: `risky_actions_after_reroll:${riskyAfterReroll}`
        }
      ]
    });
  }

  return limitFindings(findings);
}

export function evaluateBallSafety(replay: ReplayModel, context: TeamContext): AnalysisFinding[] {
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
        recommendation: contextRecommendation(context, {
          offense: "Before moving the ball, make sure the new carrier has support nearby.",
          defense: "If you steal the ball, secure it with support before making extra risky plays.",
          mixed: "Before moving the ball, make sure the new carrier has support nearby."
        }),
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

export function evaluateCageSafety(replay: ReplayModel, context: TeamContext): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    if (!turn.ballCarrierPlayerId) {
      continue;
    }

    const supportActions = countEvents(turn, "block") + countEvents(turn, "blitz");
    const riskyActions = countEvents(turn, "dodge") + countEvents(turn, "foul");

    if (supportActions > 0 || (riskyActions < 2 && !turn.possibleTurnover)) {
      continue;
    }

    findings.push({
      id: findingId("cage-safety", turn.turnNumber),
      severity: turn.possibleTurnover ? "high" : "medium",
      category: "cage_safety",
      title: `Turn ${turn.turnNumber}: ball carrier looked exposed`,
      detail: "You had the ball but made risky plays without enough protection actions first.",
      recommendation: contextRecommendation(context, {
        offense: "Build a simple cage or screen around the ball before you dodge or foul.",
        defense: "If you recover the ball on defense, protect it first before extra risky plays.",
        mixed: "Protect the ball first, then take extra risky actions."
      }),
      turnNumber: turn.turnNumber,
      evidence: [
        ...toEvidenceFromTurn(turn, 2),
        {
          detail: `support_actions:${supportActions}|risky_actions:${riskyActions}`
        }
      ]
    });
  }

  return limitFindings(findings);
}

export function evaluateScreenLanes(replay: ReplayModel, context: TeamContext): AnalysisFinding[] {
  if (context.mode === "offense") {
    return [];
  }

  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    const blockAndBlitz = countEvents(turn, "block") + countEvents(turn, "blitz");
    const dodges = countEvents(turn, "dodge");

    if (blockAndBlitz > 0 || dodges < 2) {
      continue;
    }

    findings.push({
      id: findingId("screen-lanes", turn.turnNumber),
      severity: "medium",
      category: "screen_lanes",
      title: `Turn ${turn.turnNumber}: defense looked stretched`,
      detail: "You made several reposition dodges but had no contact actions to slow the drive.",
      recommendation: "Set a two-line screen first so the opponent has to dodge before moving forward.",
      turnNumber: turn.turnNumber,
      evidence: [
        ...toEvidenceFromTurn(turn, 2),
        {
          detail: `dodges:${dodges}|contact_actions:${blockAndBlitz}`
        }
      ]
    });
  }

  return limitFindings(findings);
}

export function evaluateBlitzValue(replay: ReplayModel, context: TeamContext): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    const blitzCount = countEvents(turn, "blitz");
    if (blitzCount === 0) {
      continue;
    }

    const casualtyCount = countEvents(turn, "casualty");
    const blockCount = countEvents(turn, "block");

    if (!turn.possibleTurnover && casualtyCount > 0) {
      continue;
    }

    if (!turn.possibleTurnover && blockCount >= 2) {
      continue;
    }

    findings.push({
      id: findingId("blitz-value", turn.turnNumber),
      severity: turn.possibleTurnover ? "high" : "medium",
      category: "blitz_value",
      title: `Turn ${turn.turnNumber}: blitz gave low value`,
      detail:
        turn.possibleTurnover
          ? "The blitz was followed by a failed sequence and your turn ended early."
          : "The blitz did not create clear pressure or player advantage.",
      recommendation: contextRecommendation(context, {
        offense: "Use blitz to open the path for your ball carrier or remove a key marker.",
        defense: "Use blitz on the ball side to pressure the carrier or break the cage corner.",
        mixed: "Use blitz where it changes the board, not just for a single hit."
      }),
      turnNumber: turn.turnNumber,
      evidence: [
        ...toEvidenceFromTurn(turn, 2),
        {
          detail: `blitz:${blitzCount}|block:${blockCount}|casualty:${casualtyCount}`
        }
      ]
    });
  }

  return limitFindings(findings);
}

export function evaluateFoulTiming(replay: ReplayModel, context: TeamContext): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    const foulCount = countEvents(turn, "foul");
    if (foulCount === 0) {
      continue;
    }

    const firstFoulIndex = turn.events.findIndex((event) => event.type === "foul");
    const firstBallStateIndex = turn.events.findIndex((event) => event.type === "ball_state");
    const foulBeforeBallSafety = firstFoulIndex >= 0 && (firstBallStateIndex < 0 || firstFoulIndex < firstBallStateIndex);

    if (!turn.possibleTurnover && !foulBeforeBallSafety) {
      continue;
    }

    findings.push({
      id: findingId("foul-timing", turn.turnNumber),
      severity: turn.possibleTurnover ? "high" : "medium",
      category: "foul_timing",
      title: `Turn ${turn.turnNumber}: foul timing was risky`,
      detail: turn.possibleTurnover ? "The foul sequence was part of a turn that ended early." : "You fouled before securing the safe parts of your turn.",
      recommendation: contextRecommendation(context, {
        offense: "On offense, foul after the ball is safe and your screen is set.",
        defense: "On defense, foul after your key marks and blitz are done.",
        mixed: "Treat fouls as late-turn actions unless it directly wins the drive."
      }),
      turnNumber: turn.turnNumber,
      evidence: [
        ...toEvidenceFromTurn(turn, 2),
        {
          detail: `foul_before_ball_safety:${String(foulBeforeBallSafety)}`
        }
      ]
    });
  }

  return limitFindings(findings);
}

export function findingsToTurnAdvice(findings: AnalysisFinding[]): TurnAdvice[] {
  const severityScore = { high: 3, medium: 2, low: 1 } as const;

  return findings
    .filter((finding) => finding.turnNumber !== undefined)
    .sort((a, b) => {
      const severityDelta = severityScore[b.severity] - severityScore[a.severity];
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return (a.turnNumber ?? 0) - (b.turnNumber ?? 0);
    })
    .map(toTurnAdvice)
    .sort((a, b) => a.turnNumber - b.turnNumber)
    .slice(0, 16);
}
