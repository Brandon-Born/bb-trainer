import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";

import { extractStructuredTurnsFromReplayXml } from "@/domain/replay/extractStructuredTurns";
import { ReplayValidationError } from "@/lib/errors";
import type { ReplayModel, ReplayTeam, ReplayTurn } from "@/domain/replay/types";

const ReplayXmlSchema = z.string().trim().min(1, "Replay XML cannot be empty.");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: true,
  trimValues: true
});

const TURN_KEYS = ["Turn", "GameTurn", "PlayerTurn"];

type RecordLike = Record<string, unknown>;

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null;
}

function valueAtPath(input: unknown, path: string[]): unknown {
  let current: unknown = input;

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function walkCollect(input: unknown, targetKey: string, output: unknown[] = []): unknown[] {
  if (!isRecord(input)) {
    return output;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      walkCollect(item, targetKey, output);
    }

    return output;
  }

  for (const [key, value] of Object.entries(input)) {
    if (key === targetKey) {
      output.push(...toArray(value));
    }

    walkCollect(value, targetKey, output);
  }

  return output;
}

function dedupeUnknown(input: unknown[]): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];

  for (const item of input) {
    const key = isRecord(item) ? JSON.stringify(item) : String(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function normalizeTeam(rawTeam: unknown, index: number): ReplayTeam {
  const team = isRecord(rawTeam) ? rawTeam : {};

  const id = String(team.id ?? team.teamId ?? team.TeamId ?? team.ID ?? team.SideId ?? team.GamerSlot ?? `team-${index + 1}`);
  const name = decodeReadableText(String(team.name ?? team.teamName ?? team.TeamName ?? team.Name ?? team.SideName ?? `Team ${index + 1}`));
  const coachValue = team.coach ?? team.Coach ?? team.CoachName;

  return {
    id,
    name,
    coach: coachValue ? decodeReadableText(String(coachValue)) : undefined
  };
}

function decodeReadableText(value: string): string {
  const normalized = value.trim();

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    return value;
  }

  try {
    const decoded = Buffer.from(normalized, "base64").toString("utf8");
    if (/^[\x20-\x7E\t\r\n]+$/.test(decoded)) {
      return decoded;
    }
  } catch {
    return value;
  }

  return value;
}

function normalizeToken(raw: string): string[] {
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

function collectActionTexts(input: unknown, output: string[] = []): string[] {
  if (output.length > 4000) {
    return output;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      collectActionTexts(item, output);
    }

    return output;
  }

  if (isRecord(input)) {
    for (const [key, value] of Object.entries(input)) {
      output.push(...normalizeToken(key));
      collectActionTexts(value, output);
    }

    return output;
  }

  if (typeof input === "string") {
    output.push(...normalizeToken(input));
  }

  return output;
}

function estimateEventCount(turn: RecordLike): number {
  const eventBuckets = ["Events", "events", "Actions", "actions", "Steps", "steps", "Plays", "plays"];

  for (const key of eventBuckets) {
    const candidate = turn[key];
    if (!candidate) {
      continue;
    }

    if (Array.isArray(candidate)) {
      return Math.max(candidate.length, 1);
    }

    if (isRecord(candidate)) {
      return Math.max(Object.keys(candidate).length, 1);
    }
  }

  return Math.max(Object.keys(turn).length, 1);
}

function normalizeTurn(rawTurn: unknown, index: number): ReplayTurn {
  const turn = isRecord(rawTurn) ? rawTurn : {};

  const maybeTurnNumber = Number(
    turn.number ?? turn.turn ?? turn.Turn ?? turn.index ?? turn.turnNumber ?? turn.Sequence ?? index + 1
  );
  const turnNumber = Number.isFinite(maybeTurnNumber) ? maybeTurnNumber : index + 1;
  const teamId = turn.teamId ?? turn.TeamId ?? turn.team ?? turn.Side ?? turn.sideId;

  const actionTexts = Array.from(new Set(collectActionTexts(turn)));

  return {
    turnNumber,
    teamId: teamId ? String(teamId) : undefined,
    gamerId: undefined,
    ballCarrierPlayerId: undefined,
    possibleTurnover: false,
    endTurnReason: undefined,
    endTurnReasonLabel: undefined,
    finishingTurnType: undefined,
    events: [],
    actionTexts,
    eventCount: estimateEventCount(turn),
    raw: rawTurn
  };
}

function collectCandidates(rootNode: unknown, paths: string[][], keys: string[]): unknown[] {
  const pathValues = paths.flatMap((path) => toArray(valueAtPath(rootNode, path)));
  const walkValues = keys.flatMap((key) => walkCollect(rootNode, key));

  return dedupeUnknown([...pathValues, ...walkValues]);
}

function collectTeamCandidates(rootNode: unknown): unknown[] {
  const strictPathValues = dedupeUnknown([
    ...toArray(valueAtPath(rootNode, ["NotificationGameJoined", "InitialBoardState", "ListTeams", "TeamState"])),
    ...toArray(valueAtPath(rootNode, ["Teams", "Team"])),
    ...toArray(valueAtPath(rootNode, ["Sides", "Side"])),
    ...toArray(valueAtPath(rootNode, ["TeamStates", "TeamState"]))
  ]);

  if (strictPathValues.length > 0) {
    return strictPathValues;
  }

  const joinedNode = valueAtPath(rootNode, ["NotificationGameJoined"]);
  if (joinedNode) {
    return dedupeUnknown([...walkCollect(joinedNode, "Side"), ...walkCollect(joinedNode, "TeamState"), ...walkCollect(joinedNode, "Team")]);
  }

  return dedupeUnknown([...walkCollect(rootNode, "Side"), ...walkCollect(rootNode, "TeamState"), ...walkCollect(rootNode, "Team")]);
}

function isGenericTeamName(name: string): boolean {
  return /^Team \d+$/i.test(name.trim());
}

function isNumericLabel(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

function chooseTeamName(nameCandidate: string, coachCandidate: string | undefined, index: number): string {
  const cleanName = nameCandidate.trim();

  if (cleanName !== "" && !isGenericTeamName(cleanName) && !isNumericLabel(cleanName)) {
    return cleanName;
  }

  if (coachCandidate && !isNumericLabel(coachCandidate)) {
    return `Team ${index + 1}`;
  }

  return `Team ${index + 1}`;
}

function chooseCoachName(coachCandidate: string): string | undefined {
  const cleanCoach = coachCandidate.trim();

  if (cleanCoach === "" || isNumericLabel(cleanCoach)) {
    return undefined;
  }

  return cleanCoach;
}

function dedupeTeams(teams: ReplayTeam[]): ReplayTeam[] {
  const dedupedById = new Map<string, ReplayTeam>();

  for (const team of teams) {
    const existing = dedupedById.get(team.id);
    if (!existing) {
      dedupedById.set(team.id, team);
      continue;
    }

    if (isGenericTeamName(existing.name) && !isGenericTeamName(team.name)) {
      dedupedById.set(team.id, team);
      continue;
    }

    if (!existing.coach && team.coach) {
      dedupedById.set(team.id, team);
    }
  }

  return Array.from(dedupedById.values());
}

function extractTeamsFromGameInfos(rootNode: unknown): ReplayTeam[] {
  const gamers = toArray(valueAtPath(rootNode, ["NotificationGameJoined", "GameInfos", "GamersInfos", "GamerInfos"]));

  if (gamers.length === 0) {
    return [];
  }

  const teams = gamers.flatMap((rawGamer, index) => {
    if (!isRecord(rawGamer)) {
      return [];
    }

    const roster = isRecord(rawGamer.Roster) ? rawGamer.Roster : {};
    const rosterTeam = isRecord(roster.Team) ? roster.Team : {};
    const rawId = rosterTeam.TeamId ?? rawGamer.TeamId ?? roster.TeamId ?? rawGamer.Slot ?? index;
    const teamNameCandidate = decodeReadableText(String(roster.Name ?? rosterTeam.Name ?? ""));
    const coachNameCandidate = decodeReadableText(String(rawGamer.Name ?? roster.Coach ?? rosterTeam.Coach ?? ""));
    const coachName = chooseCoachName(coachNameCandidate);

    return [
      {
        id: String(rawId),
        name: chooseTeamName(teamNameCandidate, coachName, index),
        coach: coachName
      } satisfies ReplayTeam
    ];
  });

  return dedupeTeams(teams);
}

function normalizeTeams(rawTeams: unknown[]): ReplayTeam[] {
  const normalized = rawTeams.map(normalizeTeam);
  const deduped = dedupeTeams(normalized);
  const named = deduped.filter((team) => !isGenericTeamName(team.name));

  if (named.length >= 2) {
    return named;
  }

  return deduped;
}

function resolveMatchId(rootNode: unknown): string {
  const matchCandidate =
    valueAtPath(rootNode, ["NotificationGameJoined", "GameInfos", "Competition", "CompetitionInfos", "MatchId"]) ??
    valueAtPath(rootNode, ["NotificationGameJoined", "GameInfos", "Id"]) ??
    valueAtPath(rootNode, ["MatchId"]) ??
    valueAtPath(rootNode, ["matchId"]) ??
    valueAtPath(rootNode, ["Metadata", "MatchId"]) ??
    valueAtPath(rootNode, ["Game", "Id"]) ??
    valueAtPath(rootNode, ["id"]);

  return matchCandidate ? decodeReadableText(String(matchCandidate)) : `match-${Date.now()}`;
}

function resolveReplayVersion(rootNode: unknown): string | undefined {
  const version = valueAtPath(rootNode, ["ReplayVersion"]);
  return version ? String(version) : undefined;
}

function validateReplayVersion(version: string | undefined): void {
  if (!version) {
    return;
  }

  if (!/^\d+-\d+-\d+-\d+$/.test(version)) {
    throw new ReplayValidationError(`Unsupported replay version format: ${version}`);
  }
}

export function parseReplayXml(xml: string): ReplayModel {
  const validatedXml = ReplayXmlSchema.parse(xml);
  const xmlValidation = XMLValidator.validate(validatedXml);

  if (xmlValidation !== true) {
    throw new ReplayValidationError(`Replay XML parse failed: ${xmlValidation.err.msg}`);
  }

  let parsed: unknown;

  try {
    parsed = parser.parse(validatedXml);
  } catch (error) {
    throw new ReplayValidationError(
      error instanceof Error ? `Replay XML parse failed: ${error.message}` : "Replay XML parse failed."
    );
  }

  if (!isRecord(parsed)) {
    throw new ReplayValidationError("Replay XML did not produce a valid object tree.");
  }

  const rootTag = Object.keys(parsed)[0] ?? "Replay";
  const rootNode = parsed[rootTag] ?? parsed;
  const replayVersion = resolveReplayVersion(rootNode);
  validateReplayVersion(replayVersion);

  const structured = extractStructuredTurnsFromReplayXml(validatedXml);
  const teamsFromGameInfos = extractTeamsFromGameInfos(rootNode);
  const fallbackTeams = normalizeTeams(collectTeamCandidates(rootNode));
  const teams = teamsFromGameInfos.length >= 2 ? teamsFromGameInfos : fallbackTeams;

  const turns =
    structured.turns.length > 0
      ? structured.turns
      : collectCandidates(
          rootNode,
          [
            ["Turns", "Turn"],
            ["GameTurns", "GameTurn"],
            ["TurnHistory", "Turn"]
          ],
          TURN_KEYS
        ).map(normalizeTurn);

  return {
    matchId: resolveMatchId(rootNode),
    rootTag,
    replayVersion,
    teams,
    turns,
    unknownCodes: structured.unknownCodes,
    raw: rootNode
  };
}
