import { createHash } from "node:crypto";

import { analyzeReplayTimeline } from "@/domain/analysis/heuristics";
import { renderCoaching } from "@/domain/coaching/renderAdvice";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { buildTimeline } from "@/domain/replay/buildTimeline";
import { parseReplayXml } from "@/domain/replay/parseXml";
import type { ReplayModel, ReplayTeam, ReplayTurn } from "@/domain/replay/types";

export type ReplayAnalysisReport = {
  id: string;
  generatedAt: string;
  replay: {
    matchId: string;
    replayVersion?: string;
    format: "xml" | "bbr";
    teamCount: number;
    turnCount: number;
    teams: Array<{
      id: string;
      name: string;
      coach?: string;
    }>;
    unknownCodes: Array<{
      category: "step" | "action" | "roll" | "end_turn_reason";
      code: number;
      occurrences: number;
    }>;
  };
  analysis: ReturnType<typeof analyzeReplayTimeline>;
  coaching: ReturnType<typeof renderCoaching>;
  teamReports: Array<{
    teamId: string;
    teamName: string;
    coachName?: string;
    analysis: ReturnType<typeof analyzeReplayTimeline>;
    coaching: ReturnType<typeof renderCoaching>;
  }>;
};

export type AnalyzeReplayOptions = {
  maxDecodedChars?: number;
};

function buildReportId(xml: string): string {
  return createHash("sha1").update(xml).digest("hex").slice(0, 12);
}

function isGenericTeamName(name: string): boolean {
  return /^Team \d+$/i.test(name.trim());
}

function buildUniquePlayerTeamMap(replay: ReplayModel): Map<string, string> {
  const playerToTeam = new Map<string, string>();
  const conflictingIds = new Set<string>();
  const byTeam = replay.playerNamesByTeamAndId ?? {};

  for (const key of Object.keys(byTeam)) {
    const separatorIndex = key.indexOf(":");
    if (separatorIndex <= 0 || separatorIndex >= key.length - 1) {
      continue;
    }

    const teamId = key.slice(0, separatorIndex);
    const playerId = key.slice(separatorIndex + 1);
    if (!teamId || !playerId) {
      continue;
    }

    const existing = playerToTeam.get(playerId);
    if (!existing) {
      playerToTeam.set(playerId, teamId);
      continue;
    }

    if (existing !== teamId) {
      playerToTeam.delete(playerId);
      conflictingIds.add(playerId);
    }
  }

  for (const playerId of conflictingIds) {
    playerToTeam.delete(playerId);
  }

  return playerToTeam;
}

function inferTurnTeamId(turn: ReplayTurn, playerToTeam: Map<string, string>): string | undefined {
  const weightedScores = new Map<string, number>();

  const addScore = (teamId: string, score: number) => {
    weightedScores.set(teamId, (weightedScores.get(teamId) ?? 0) + score);
  };

  for (const event of turn.events) {
    if (!event.playerId) {
      continue;
    }

    const ownerTeamId = playerToTeam.get(event.playerId);
    if (!ownerTeamId) {
      continue;
    }

    const score =
      event.type === "dodge" || event.type === "blitz" || event.type === "foul" || event.type === "reroll"
        ? 4
        : event.type === "block"
          ? 2
          : 1;

    addScore(ownerTeamId, score);
  }

  if (turn.ballCarrierPlayerId) {
    const carrierTeamId = playerToTeam.get(turn.ballCarrierPlayerId);
    if (carrierTeamId) {
      addScore(carrierTeamId, 2);
    }
  }

  if (turn.teamId) {
    addScore(turn.teamId, 1);
  }

  const ranked = Array.from(weightedScores.entries()).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return undefined;
  }

  if (ranked.length > 1 && ranked[1]![1] === ranked[0]![1]) {
    return undefined;
  }

  return ranked[0]![0];
}

function eventBelongsToTeam(event: ReplayTurn["events"][number], teamId: string, playerToTeam: Map<string, string>): boolean {
  if (event.playerId) {
    const ownerTeamId = playerToTeam.get(event.playerId);
    if (ownerTeamId) {
      return ownerTeamId === teamId;
    }
  }

  if (event.teamId) {
    return event.teamId === teamId;
  }

  return true;
}

function cloneTurn(turn: ReplayTurn, turnNumber: number, scopedTeamId: string, playerToTeam: Map<string, string>): ReplayTurn {
  const scopedEvents = turn.events.filter((event) => eventBelongsToTeam(event, scopedTeamId, playerToTeam));
  const carrierTeamId = turn.ballCarrierPlayerId ? playerToTeam.get(turn.ballCarrierPlayerId) : undefined;
  const scopedCarrier =
    turn.ballCarrierPlayerId && carrierTeamId && carrierTeamId !== scopedTeamId ? undefined : turn.ballCarrierPlayerId;
  const actionTexts = Array.from(
    new Set(
      scopedEvents
        .flatMap((event) => [event.type, event.sourceTag, event.actionLabel, event.stepLabel])
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase())
    )
  );

  return {
    ...turn,
    teamId: scopedTeamId,
    ballCarrierPlayerId: scopedCarrier,
    events: scopedEvents,
    actionTexts,
    eventCount: scopedEvents.length,
    turnNumber,
    raw: {
      ...(typeof turn.raw === "object" && turn.raw !== null ? (turn.raw as Record<string, unknown>) : {}),
      coachTurnNumber: turnNumber,
      originalTurnNumber: turn.turnNumber,
      originalTeamId: turn.teamId
    }
  };
}

function normalizeTeamTurns(replay: ReplayModel, teamId: string, playerToTeam: Map<string, string>): ReplayTurn[] {
  let turns = replay.turns.filter((turn) => turn.teamId === teamId);

  if (turns.length < 16) {
    const inferred = replay.turns.filter((turn) => inferTurnTeamId(turn, playerToTeam) === teamId);
    if (inferred.length > turns.length) {
      turns = inferred;
    }
  }

  if (turns.length === 0 && replay.teams.length === 2) {
    const teamIndex = replay.teams.findIndex((team) => team.id === teamId);
    if (teamIndex >= 0) {
      turns = replay.turns.filter((_, index) => index % 2 === teamIndex);
    }
  }

  const trimmed = turns.slice(0, 16);

  return trimmed.map((turn, index) => cloneTurn(turn, index + 1, teamId, playerToTeam));
}

function selectPlayableTeams(replay: ReplayModel): ReplayTeam[] {
  const usage = new Map<string, number>();

  for (const turn of replay.turns) {
    if (!turn.teamId) {
      continue;
    }

    usage.set(turn.teamId, (usage.get(turn.teamId) ?? 0) + 1);
  }

  const byUsage = replay.teams
    .map((team) => ({
      team,
      usage: usage.get(team.id) ?? 0
    }))
    .filter((entry) => entry.usage > 0)
    .sort((a, b) => b.usage - a.usage)
    .map((entry) => entry.team);

  if (byUsage.length >= 2) {
    return byUsage.slice(0, 2);
  }

  const namedTeams = replay.teams.filter((team) => !isGenericTeamName(team.name));
  if (namedTeams.length >= 2) {
    return namedTeams.slice(0, 2);
  }

  if (byUsage.length === 1) {
    const fallback = replay.teams.find((team) => team.id !== byUsage[0]?.id);
    return fallback ? [byUsage[0]!, fallback] : byUsage;
  }

  return replay.teams.slice(0, 2);
}

export function scopeReplayToTeam(replay: ReplayModel, teamId: string): ReplayModel {
  const playerToTeam = buildUniquePlayerTeamMap(replay);
  const teamTurns = normalizeTeamTurns(replay, teamId, playerToTeam);

  return {
    ...replay,
    analysisTeamId: teamId,
    turns: teamTurns
  };
}

function buildTeamReport(replay: ReplayModel, teamId: string, teamName: string, coachName?: string) {
  const scopedReplay = scopeReplayToTeam(replay, teamId);
  const timeline = buildTimeline(scopedReplay);
  const analysis = analyzeReplayTimeline(scopedReplay, timeline);
  const coaching = renderCoaching(analysis);

  return {
    teamId,
    teamName,
    coachName,
    analysis,
    coaching
  };
}

export function analyzeReplayXml(xml: string, format: "xml" | "bbr" = "xml"): ReplayAnalysisReport {
  const replay = parseReplayXml(xml);
  const timeline = buildTimeline(replay);
  const analysis = analyzeReplayTimeline(replay, timeline);
  const coaching = renderCoaching(analysis);

  const playableTeams = selectPlayableTeams(replay);
  const teamReports = playableTeams.map((team) => buildTeamReport(replay, team.id, team.name, team.coach));

  return {
    id: buildReportId(xml),
    generatedAt: new Date().toISOString(),
    replay: {
      matchId: replay.matchId,
      replayVersion: replay.replayVersion,
      format,
      teamCount: playableTeams.length,
      turnCount: replay.turns.length,
      teams: playableTeams.map((team) => ({
        id: team.id,
        name: team.name,
        coach: team.coach
      })),
      unknownCodes: replay.unknownCodes
    },
    analysis,
    coaching,
    teamReports
  };
}

export function analyzeReplayInput(input: string, options: AnalyzeReplayOptions = {}): ReplayAnalysisReport {
  const decoded = decodeReplayInput(input, {
    maxDecodedChars: options.maxDecodedChars
  });
  return analyzeReplayXml(decoded.xml, decoded.format);
}
