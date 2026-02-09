import type { AnalysisFinding, AnalysisResult, TeamContext } from "@/domain/analysis/types";
import {
  evaluateActionOrdering,
  evaluateBlitzValue,
  evaluateBallSafety,
  evaluateCageSafety,
  evaluateFoulTiming,
  evaluateRerollTiming,
  evaluateScreenLanes,
  evaluateTurnoverCause,
  findingsToTurnAdvice
} from "@/domain/analysis/rules";
import type { ReplayModel, TimelineTurn } from "@/domain/replay/types";

function rankBySeverity(findings: AnalysisFinding[]): AnalysisFinding[] {
  const score = {
    high: 3,
    medium: 2,
    low: 1
  } as const;

  return [...findings].sort((a, b) => score[b.severity] - score[a.severity]);
}

function buildTeamContext(replay: ReplayModel): TeamContext {
  const totalTurns = replay.turns.length;
  if (totalTurns === 0) {
    return {
      mode: "mixed",
      offenseTurns: 0,
      defenseTurns: 0,
      ballControlRate: 0
    };
  }

  const offenseTurns = replay.turns.filter((turn) => turn.ballCarrierPlayerId !== undefined).length;
  const defenseTurns = Math.max(totalTurns - offenseTurns, 0);
  const ballControlRate = offenseTurns / totalTurns;

  if (ballControlRate >= 0.6) {
    return {
      mode: "offense",
      offenseTurns,
      defenseTurns,
      ballControlRate
    };
  }

  if (ballControlRate <= 0.35) {
    return {
      mode: "defense",
      offenseTurns,
      defenseTurns,
      ballControlRate
    };
  }

  return {
    mode: "mixed",
    offenseTurns,
    defenseTurns,
    ballControlRate
  };
}

export function analyzeReplayTimeline(replay: ReplayModel, timeline: TimelineTurn[]): AnalysisResult {
  const context = buildTeamContext(replay);
  const metrics = timeline.reduce(
    (acc, turn) => {
      acc.totalTurns += 1;
      acc.turnoverSignals += turn.keywordHits.turnover;
      acc.rerollSignals += turn.keywordHits.reroll;
      acc.blitzSignals += turn.keywordHits.blitz;
      acc.foulSignals += turn.keywordHits.foul;
      acc.aggressiveActionSignals += turn.keywordHits.blitz + turn.keywordHits.dodge + turn.keywordHits.block + turn.keywordHits.foul;

      return acc;
    },
    {
      totalTurns: 0,
      turnoverSignals: 0,
      rerollSignals: 0,
      aggressiveActionSignals: 0,
      ballCarrierTransitions: 0,
      blitzSignals: 0,
      foulSignals: 0
    }
  );

  for (let i = 1; i < replay.turns.length; i += 1) {
    const current = replay.turns[i];
    const previous = replay.turns[i - 1];
    if (current?.ballCarrierPlayerId && previous?.ballCarrierPlayerId && current.ballCarrierPlayerId !== previous.ballCarrierPlayerId) {
      metrics.ballCarrierTransitions += 1;
    }
  }

  const findings = rankBySeverity([
    ...evaluateTurnoverCause(replay, context),
    ...evaluateRerollTiming(replay, context),
    ...evaluateActionOrdering(replay, context),
    ...evaluateBallSafety(replay, context),
    ...evaluateCageSafety(replay, context),
    ...evaluateScreenLanes(replay, context),
    ...evaluateBlitzValue(replay, context),
    ...evaluateFoulTiming(replay, context)
  ]);

  const turnAdvice = findingsToTurnAdvice(findings);

  return {
    context,
    metrics,
    findings,
    turnAdvice
  };
}
