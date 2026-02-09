import type { AnalysisFinding, TeamContext, TurnAdvice } from "@/domain/analysis/types";
import type { ReplayEvent, ReplayModel, ReplayTurn } from "@/domain/replay/types";

const SOURCE_TAG_LABELS: Record<string, string> = {
  ResultRoll: "a dice roll",
  ResultBlockRoll: "a block roll",
  ResultBlockOutcome: "a block result",
  ResultPushBack: "a push",
  ResultUseAction: "an action declaration",
  ResultTeamRerollUsage: "a reroll decision",
  QuestionTeamRerollUsage: "a reroll decision",
  Carrier: "ball movement",
  BallStep: "ball movement",
  EventEndTurn: "turn end event"
};

function findingId(prefix: string, turn: number): string {
  return `${prefix}-turn-${turn}`;
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

function toTurnAdvice(finding: AnalysisFinding): TurnAdvice {
  return {
    turnNumber: finding.turnNumber ?? 0,
    category: finding.category,
    severity: finding.severity,
    happened: finding.title,
    riskyBecause: finding.detail,
    saferAlternative: finding.recommendation,
    confidence: confidenceFromSeverity(finding.severity),
    evidence: finding.evidence
  };
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

function activeTeamIdForTurn(replay: ReplayModel, turn: ReplayTurn): string | undefined {
  return replay.analysisTeamId ?? turn.teamId;
}

function playerNameFromId(replay: ReplayModel, playerId: string | undefined, teamIdHint?: string): string | undefined {
  if (!playerId) {
    return undefined;
  }

  if (teamIdHint) {
    const byTeamKey = `${teamIdHint}:${playerId}`;
    const byTeamName = replay.playerNamesByTeamAndId?.[byTeamKey];
    if (byTeamName) {
      return byTeamName;
    }

    const hasMappedTeamForPlayer = Object.keys(replay.playerNamesByTeamAndId ?? {}).some((key) => key.endsWith(`:${playerId}`));
    if (hasMappedTeamForPlayer) {
      return undefined;
    }
  }

  return replay.playerNamesById?.[playerId];
}

function playerDisplayName(replay: ReplayModel, playerId: string | undefined, teamIdHint?: string): string {
  if (!playerId) {
    return "a player";
  }

  return playerNameFromId(replay, playerId, teamIdHint) ?? `Player ${playerId}`;
}

function describeReplayEvent(replay: ReplayModel, event: ReplayEvent | undefined, teamIdHint?: string): string {
  if (!event) {
    return "a risky play";
  }

  const eventTeamHint = teamIdHint ?? event.teamId;

  if (event.type === "dodge") {
    return `${playerDisplayName(replay, event.playerId, eventTeamHint)} attempted a dodge`;
  }

  if (event.type === "block") {
    return `${playerDisplayName(replay, event.playerId, eventTeamHint)} attempted a block`;
  }

  if (event.type === "blitz") {
    return `${playerDisplayName(replay, event.playerId, eventTeamHint)} used a blitz action`;
  }

  if (event.type === "foul") {
    return `${playerDisplayName(replay, event.playerId, eventTeamHint)} attempted a foul`;
  }

  if (event.type === "ball_state") {
    return "the ball changed state";
  }

  const tagLabel = SOURCE_TAG_LABELS[event.sourceTag] ?? "a risky sequence";
  return `${playerDisplayName(replay, event.playerId, eventTeamHint)} took ${tagLabel}`;
}

function isPlayerOnTeam(replay: ReplayModel, teamId: string | undefined, playerId: string | undefined): boolean | undefined {
  if (!teamId || !playerId) {
    return undefined;
  }

  const byTeamMap = replay.playerNamesByTeamAndId ?? {};
  const teamKey = `${teamId}:${playerId}`;
  if (teamKey in byTeamMap) {
    return true;
  }

  const hasPlayerInAnyTeam = Object.keys(byTeamMap).some((key) => key.endsWith(`:${playerId}`));
  if (hasPlayerInAnyTeam) {
    return false;
  }

  return undefined;
}

function toEvidenceFromTurn(turn: ReplayTurn, maxItems = 3): AnalysisFinding["evidence"] {
  return turn.events.slice(0, maxItems).map((event) => ({
    eventType: event.type,
    sourceTag: event.sourceTag,
    code: event.actionLabel ?? event.stepLabel
  }));
}

function limitFindings(findings: AnalysisFinding[], maxByCategory = 5): AnalysisFinding[] {
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

function countRiskyActionsBeforeBallSafety(turn: ReplayTurn): number {
  const firstBallIndex = turn.events.findIndex((event) => event.type === "ball_state");
  if (firstBallIndex <= 0) {
    return 0;
  }

  return turn.events
    .slice(0, firstBallIndex)
    .filter((event) => event.type === "dodge" || event.type === "block" || event.type === "blitz" || event.type === "foul").length;
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
      turn.events.find((event) => event.type === "foul") ??
      turn.events.find((event) => event.type === "ball_state");

    const activeTeamId = activeTeamIdForTurn(replay, turn);
    if (activeTeamId && likelyCauseEvent?.playerId && isPlayerOnTeam(replay, activeTeamId, likelyCauseEvent.playerId) === false) {
      continue;
    }

    const happened = describeReplayEvent(replay, likelyCauseEvent, activeTeamId);

    findings.push({
      id: findingId("turnover-cause", turn.turnNumber),
      severity: "high",
      category: "turnover_cause",
      title: `Turn ${turn.turnNumber}: turn ended early after ${happened}`,
      detail: "Your turn stopped before your plan was complete.",
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
    const riskyBeforeBall = countRiskyActionsBeforeBallSafety(turn);
    if (riskyBeforeBall === 0) {
      continue;
    }

    if (!turn.possibleTurnover && riskyBeforeBall < 2) {
      continue;
    }

    findings.push({
      id: findingId("action-order", turn.turnNumber),
      severity: turn.possibleTurnover ? "high" : "medium",
      category: "action_ordering",
      title: `Turn ${turn.turnNumber}: risky actions came before safe setup`,
      detail: `You took ${riskyBeforeBall} risky action${riskyBeforeBall === 1 ? "" : "s"} before securing the safe parts of your turn.`,
      recommendation: contextRecommendation(context, {
        offense: "Start with safe movement and ball protection, then do blocks, blitzes, and dodges.",
        defense: "Set your screen and marks first, then do blocks, blitzes, and dodges.",
        mixed: "Start with safe movement first, then do risky dice actions."
      }),
      turnNumber: turn.turnNumber,
      evidence: [
        ...toEvidenceFromTurn(turn),
        {
          detail: `risky_before_ball:${riskyBeforeBall}`
        }
      ]
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
      const activeTeamId = activeTeamIdForTurn(replay, turn);
      const previousCarrierOnTeam = isPlayerOnTeam(replay, activeTeamId, previousCarrier);
      const currentCarrierOnTeam = isPlayerOnTeam(replay, activeTeamId, turn.ballCarrierPlayerId);

      if (previousCarrierOnTeam === false && currentCarrierOnTeam === true) {
        previousCarrier = turn.ballCarrierPlayerId;
        continue;
      }

      if (previousCarrierOnTeam === false && currentCarrierOnTeam === false) {
        previousCarrier = turn.ballCarrierPlayerId;
        continue;
      }

      const previousName = playerDisplayName(
        replay,
        previousCarrier,
        previousCarrierOnTeam === false ? undefined : activeTeamId
      );
      const nextName = playerDisplayName(
        replay,
        turn.ballCarrierPlayerId,
        currentCarrierOnTeam === false ? undefined : activeTeamId
      );

      const title =
        previousCarrierOnTeam === true && currentCarrierOnTeam === false
          ? `Turn ${turn.turnNumber}: opponent took the ball from ${previousName}`
          : `Turn ${turn.turnNumber}: ball moved from ${previousName} to ${nextName}`;

      findings.push({
        id: findingId("ball-safety", turn.turnNumber),
        severity: previousCarrierOnTeam === true && currentCarrierOnTeam === false ? "high" : "medium",
        category: "ball_safety",
        title,
        detail:
          previousCarrierOnTeam === true && currentCarrierOnTeam === false
            ? "You lost control of the ball between your turns."
            : "The ball moved to a new player. This can be risky if that player is not well protected.",
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

    const activeTeamId = activeTeamIdForTurn(replay, turn);
    const carrierOnActiveTeam = isPlayerOnTeam(replay, activeTeamId, turn.ballCarrierPlayerId);
    if (carrierOnActiveTeam === false) {
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
      title: `Turn ${turn.turnNumber}: ${playerDisplayName(replay, turn.ballCarrierPlayerId, activeTeamId)} looked exposed`,
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
      title: `Turn ${turn.turnNumber}: defense lane control was weak`,
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
    const blitzEvent = turn.events.find((event) => event.type === "blitz");

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
      title: `Turn ${turn.turnNumber}: ${playerDisplayName(replay, blitzEvent?.playerId, activeTeamIdForTurn(replay, turn))} blitz gave low value`,
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

    const foulEvent = turn.events.find((event) => event.type === "foul");

    findings.push({
      id: findingId("foul-timing", turn.turnNumber),
      severity: turn.possibleTurnover ? "high" : "medium",
      category: "foul_timing",
      title: `Turn ${turn.turnNumber}: ${playerDisplayName(replay, foulEvent?.playerId, activeTeamIdForTurn(replay, turn))} foul timing was risky`,
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

export function evaluateKickoffSetup(replay: ReplayModel, context: TeamContext): AnalysisFinding[] {
  if (context.mode === "offense") {
    return [];
  }

  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    if (turn.turnNumber > 2) {
      continue;
    }

    const blocks = countEvents(turn, "block");
    const blitzes = countEvents(turn, "blitz");
    const dodges = countEvents(turn, "dodge");

    if (blocks + blitzes > 0 || dodges < 2) {
      continue;
    }

    findings.push({
      id: findingId("kickoff-setup", turn.turnNumber),
      severity: "medium",
      category: "kickoff_setup",
      title: `Turn ${turn.turnNumber}: kickoff setup looked passive`,
      detail: "Early defensive turn had movement but little direct pressure.",
      recommendation: "After kickoff, build pressure with marks or one key blitz so the opponent cannot advance for free.",
      turnNumber: turn.turnNumber,
      evidence: [
        ...toEvidenceFromTurn(turn, 2),
        {
          detail: `blocks:${blocks}|blitzes:${blitzes}|dodges:${dodges}`
        }
      ]
    });
  }

  return limitFindings(findings, 2);
}

export function evaluateSurfRisk(replay: ReplayModel): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    const pushEvents = turn.events.filter((event) => event.sourceTag === "ResultPushBack");
    if (pushEvents.length === 0) {
      continue;
    }

    const dodges = countEvents(turn, "dodge");
    if (!turn.possibleTurnover && dodges < 2) {
      continue;
    }

    findings.push({
      id: findingId("surf-risk", turn.turnNumber),
      severity: turn.possibleTurnover ? "high" : "medium",
      category: "surf_risk",
      title: `Turn ${turn.turnNumber}: sideline push sequence was risky`,
      detail: "Chain pushes near the sideline can backfire when support and positioning are not set first.",
      recommendation: "Before pushing near the sideline, set a backup marker so your player is not exposed if dice fail.",
      turnNumber: turn.turnNumber,
      evidence: [
        ...pushEvents.slice(0, 2).map((event) => ({
          eventType: event.type,
          sourceTag: event.sourceTag,
          detail: `player:${event.playerId ?? "unknown"}`
        })),
        {
          detail: `pushes:${pushEvents.length}|dodges:${dodges}`
        }
      ]
    });
  }

  return limitFindings(findings, 3);
}

export function evaluateScoringWindow(replay: ReplayModel, context: TeamContext): AnalysisFinding[] {
  if (context.mode === "defense") {
    return [];
  }

  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    if (turn.turnNumber < 14 || !turn.ballCarrierPlayerId) {
      continue;
    }

    const activeTeamId = activeTeamIdForTurn(replay, turn);
    const carrierOnActiveTeam = isPlayerOnTeam(replay, activeTeamId, turn.ballCarrierPlayerId);
    if (carrierOnActiveTeam === false) {
      continue;
    }

    const riskyLateActions = countEvents(turn, "dodge") + countEvents(turn, "blitz") + countEvents(turn, "foul");
    const scoredOrEndOfHalf = turn.endTurnReason === 4;

    if (!turn.possibleTurnover && (scoredOrEndOfHalf || riskyLateActions < 3)) {
      continue;
    }

    findings.push({
      id: findingId("scoring-window", turn.turnNumber),
      severity: turn.possibleTurnover ? "high" : "medium",
      category: "scoring_window",
      title: `Turn ${turn.turnNumber}: scoring window management was risky`,
      detail: `${playerDisplayName(replay, turn.ballCarrierPlayerId, activeTeamId)} had the ball in late turns, but the sequence stayed high risk.`,
      recommendation: "In late turns, choose the shortest safe route to score or fully secure the ball for next turn.",
      turnNumber: turn.turnNumber,
      evidence: [
        ...toEvidenceFromTurn(turn, 2),
        {
          detail: `late_turn_risky_actions:${riskyLateActions}|end_reason:${String(turn.endTurnReason ?? "unknown")}`
        }
      ]
    });
  }

  return limitFindings(findings, 3);
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
