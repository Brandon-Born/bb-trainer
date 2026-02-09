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

function cloneTurn(turn: ReplayTurn, turnNumber: number): ReplayTurn {
  return {
    ...turn,
    turnNumber,
    events: [...turn.events],
    actionTexts: [...turn.actionTexts],
    raw: {
      ...(typeof turn.raw === "object" && turn.raw !== null ? (turn.raw as Record<string, unknown>) : {}),
      coachTurnNumber: turnNumber,
      originalTurnNumber: turn.turnNumber
    }
  };
}

function normalizeTeamTurns(replay: ReplayModel, teamId: string): ReplayTurn[] {
  let turns = replay.turns.filter((turn) => turn.teamId === teamId);

  if (turns.length === 0 && replay.teams.length === 2) {
    const teamIndex = replay.teams.findIndex((team) => team.id === teamId);
    if (teamIndex >= 0) {
      turns = replay.turns.filter((_, index) => index % 2 === teamIndex);
    }
  }

  const trimmed = turns.slice(0, 16);

  return trimmed.map((turn, index) => cloneTurn(turn, index + 1));
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

function buildTeamScopedReplay(replay: ReplayModel, teamId: string): ReplayModel {
  const teamTurns = normalizeTeamTurns(replay, teamId);

  return {
    ...replay,
    turns: teamTurns
  };
}

function buildTeamReport(replay: ReplayModel, teamId: string, teamName: string, coachName?: string) {
  const scopedReplay = buildTeamScopedReplay(replay, teamId);
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
