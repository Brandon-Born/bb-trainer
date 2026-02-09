import { XMLParser } from "fast-xml-parser";

import {
  ACTION_CODE_MAP,
  END_TURN_REASON_MAP,
  ROLL_TYPE_MAP,
  STEP_TYPE_MAP,
  labelForCode
} from "@/domain/replay/mappings";
import type { ReplayEvent, ReplayTurn, ReplayUnknownCode } from "@/domain/replay/types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: true,
  trimValues: true
});

const STRUCTURED_TOKEN_REGEX = /<(EventExecuteSequence|EventEndTurn|EventActiveGamerChanged|Carrier)>([\s\S]*?)<\/\1>/g;
const STEP_MESSAGE_DATA_REGEX = /<Step><Name>[^<]*<\/Name><MessageData>([^<]*)<\/MessageData>/;
const RESULT_MESSAGE_DATA_REGEX = /<StringMessage><Name>[^<]*<\/Name><MessageData>([^<]*)<\/MessageData><\/StringMessage>/g;

type Context = {
  stepType?: number;
  playerId?: string;
  targetId?: string;
  teamId?: string;
  gamerId?: string;
};

function toNumber(input: unknown): number | undefined {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toStringValue(input: unknown): string | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }

  return String(input);
}

function decodeBase64Chain(value: string): string {
  let current = value;

  for (let depth = 0; depth < 2; depth += 1) {
    try {
      current = Buffer.from(current, "base64").toString("utf8");
    } catch {
      break;
    }
  }

  return current;
}

function parseDecodedXml(input: string): Record<string, unknown> | null {
  try {
    const parsed = parser.parse(input);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function incrementUnknownCode(
  unknownCodeCounters: Map<string, ReplayUnknownCode>,
  category: ReplayUnknownCode["category"],
  code: number
): void {
  const key = `${category}:${code}`;
  const existing = unknownCodeCounters.get(key);

  if (existing) {
    existing.occurrences += 1;
    return;
  }

  unknownCodeCounters.set(key, {
    category,
    code,
    occurrences: 1
  });
}

function registerKnownOrUnknown(
  unknownCodeCounters: Map<string, ReplayUnknownCode>,
  category: ReplayUnknownCode["category"],
  code: number | undefined,
  knownMap: Record<number, string>
): void {
  if (code === undefined) {
    return;
  }

  if (!(code in knownMap)) {
    incrementUnknownCode(unknownCodeCounters, category, code);
  }
}

function collectSequenceEvents(block: string, unknownCodeCounters: Map<string, ReplayUnknownCode>): ReplayEvent[] {
  const events: ReplayEvent[] = [];

  const stepMessageData = block.match(STEP_MESSAGE_DATA_REGEX)?.[1];
  const stepDecodedXml = stepMessageData ? decodeBase64Chain(stepMessageData) : "";
  const stepParsed = stepDecodedXml.startsWith("<") ? parseDecodedXml(stepDecodedXml) : null;
  const stepRootTag = stepParsed ? Object.keys(stepParsed)[0] : undefined;
  const stepPayload = stepRootTag ? (stepParsed?.[stepRootTag] as Record<string, unknown> | undefined) : undefined;

  const sequenceContext: Context = {
    stepType: toNumber(stepPayload?.StepType),
    playerId: toStringValue(stepPayload?.PlayerId),
    targetId: toStringValue(stepPayload?.TargetId),
    teamId: toStringValue(stepPayload?.TeamId),
    gamerId: toStringValue(stepPayload?.GamerId)
  };

  registerKnownOrUnknown(unknownCodeCounters, "step", sequenceContext.stepType, STEP_TYPE_MAP);

  if (stepRootTag === "BallStep") {
    events.push({
      type: "ball_state",
      sourceTag: "BallStep",
      sourceLabel: "ball_state_change",
      stepType: sequenceContext.stepType,
      stepLabel: labelForCode(STEP_TYPE_MAP, sequenceContext.stepType, "step"),
      playerId: sequenceContext.playerId,
      targetId: sequenceContext.targetId,
      teamId: sequenceContext.teamId,
      gamerId: sequenceContext.gamerId,
      payload: stepPayload
    });
  }

  const messageDataValues = Array.from(block.matchAll(RESULT_MESSAGE_DATA_REGEX)).map((match) => match[1]);

  for (const messageData of messageDataValues) {
    const decodedXml = decodeBase64Chain(messageData);
    if (!decodedXml.startsWith("<")) {
      continue;
    }

    const parsed = parseDecodedXml(decodedXml);
    if (!parsed) {
      continue;
    }

    const rootTag = Object.keys(parsed)[0];
    if (!rootTag) {
      continue;
    }

    const payload = parsed[rootTag] as Record<string, unknown> | undefined;
    const stepType = sequenceContext.stepType;
    const playerId = toStringValue(payload?.PlayerId ?? payload?.PushedPlayerId ?? sequenceContext.playerId);
    const targetId = toStringValue(payload?.TargetId ?? sequenceContext.targetId);
    const teamId = toStringValue(payload?.TeamId ?? sequenceContext.teamId);
    const gamerId = toStringValue(payload?.GamerId ?? sequenceContext.gamerId);
    const actionCode = toNumber(payload?.Action);
    const rollType = toNumber(payload?.RollType);

    registerKnownOrUnknown(unknownCodeCounters, "action", actionCode, ACTION_CODE_MAP);
    registerKnownOrUnknown(unknownCodeCounters, "roll", rollType, ROLL_TYPE_MAP);

    const baseEvent = {
      sourceTag: rootTag,
      stepType,
      stepLabel: labelForCode(STEP_TYPE_MAP, stepType, "step"),
      playerId,
      targetId,
      teamId,
      gamerId,
      actionCode,
      actionLabel: labelForCode(ACTION_CODE_MAP, actionCode, "action"),
      payload
    } satisfies Omit<ReplayEvent, "type">;

    if (rootTag === "ResultBlockRoll" || rootTag === "ResultBlockOutcome" || rootTag === "ResultPushBack") {
      events.push({ type: "block", sourceLabel: "block_resolution", ...baseEvent });
    }

    if (rootTag === "ResultUseAction" && actionCode === 2) {
      events.push({ type: "blitz", sourceLabel: "declared_blitz", ...baseEvent });
    }

    if (rootTag === "ResultUseAction" && actionCode === 6) {
      events.push({ type: "foul", sourceLabel: "declared_foul", ...baseEvent });
    }

    if (rootTag === "ResultFoulRoll" || rootTag === "ResultFoulOutcome") {
      events.push({ type: "foul", sourceLabel: "foul_resolution", ...baseEvent });
    }

    if (rootTag === "ResultRoll" && sequenceContext.stepType === 1) {
      events.push({ type: "dodge", sourceLabel: "dodge_roll", ...baseEvent });
    }

    if (rootTag === "QuestionTeamRerollUsage" || rootTag === "ResultTeamRerollUsage") {
      events.push({ type: "reroll", sourceLabel: "team_reroll", ...baseEvent });
    }

    if (rootTag === "ResultInjuryRoll" || rootTag === "ResultCasualtyRoll" || rootTag === "ResultPlayerRemoval") {
      events.push({ type: "casualty", sourceLabel: "injury_chain", ...baseEvent });
    }

    if (rootTag === "ResultTouchBack") {
      events.push({ type: "ball_state", sourceLabel: "touchback", ...baseEvent });
    }
  }

  return events;
}

function buildTurn(turnNumber: number, gamerId?: string): ReplayTurn {
  return {
    turnNumber,
    teamId: undefined,
    gamerId,
    ballCarrierPlayerId: undefined,
    possibleTurnover: false,
    endTurnReason: undefined,
    endTurnReasonLabel: undefined,
    finishingTurnType: undefined,
    events: [],
    actionTexts: [],
    eventCount: 0,
    raw: {}
  };
}

function finalizeTurn(turn: ReplayTurn): ReplayTurn {
  const actionTexts = turn.events
    .flatMap((event) => [event.type, event.sourceTag, event.actionLabel, event.stepLabel])
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  return {
    ...turn,
    actionTexts: Array.from(new Set(actionTexts)),
    eventCount: turn.events.length,
    raw: {
      gamerId: turn.gamerId,
      endTurnReason: turn.endTurnReason,
      finishingTurnType: turn.finishingTurnType
    }
  };
}

function applySequenceEventsToTurn(turn: ReplayTurn, events: ReplayEvent[]): void {
  if (events.length === 0) {
    return;
  }

  turn.events.push(...events);

  if (!turn.teamId) {
    const teamEvent = events.find((event) => event.teamId !== undefined);
    turn.teamId = teamEvent?.teamId;
  }

  if (!turn.gamerId) {
    const gamerEvent = events.find((event) => event.gamerId !== undefined);
    turn.gamerId = gamerEvent?.gamerId;
  }
}

export function extractStructuredTurnsFromReplayXml(xml: string): { turns: ReplayTurn[]; unknownCodes: ReplayUnknownCode[] } {
  const turns: ReplayTurn[] = [];
  const unknownCodeCounters = new Map<string, ReplayUnknownCode>();

  let activeGamerId: string | undefined;
  let currentTurn = buildTurn(1, activeGamerId);
  let foundStructuredData = false;

  for (const tokenMatch of xml.matchAll(STRUCTURED_TOKEN_REGEX)) {
    const tag = tokenMatch[1];
    const body = tokenMatch[2];

    if (tag === "EventActiveGamerChanged") {
      const gamerMatch = body.match(/<NewActiveGamer>([^<]+)<\/NewActiveGamer>/);
      if (gamerMatch?.[1]) {
        activeGamerId = gamerMatch[1];
        if (!currentTurn.gamerId) {
          currentTurn.gamerId = activeGamerId;
        }
      }

      foundStructuredData = true;
      continue;
    }

    if (tag === "Carrier") {
      const carrierId = body.trim();
      if (carrierId !== "" && carrierId !== "-1") {
        currentTurn.ballCarrierPlayerId = carrierId;
        currentTurn.events.push({
          type: "ball_state",
          sourceTag: "Carrier",
          sourceLabel: "ball_carrier",
          playerId: carrierId
        });
      }

      foundStructuredData = true;
      continue;
    }

    if (tag === "EventExecuteSequence") {
      const sequenceEvents = collectSequenceEvents(body, unknownCodeCounters);
      applySequenceEventsToTurn(currentTurn, sequenceEvents);

      foundStructuredData = true;
      continue;
    }

    if (tag === "EventEndTurn") {
      const reason = toNumber(body.match(/<Reason>(-?\d+)<\/Reason>/)?.[1]);
      const finishingTurnType = toNumber(body.match(/<FinishingTurnType>(-?\d+)<\/FinishingTurnType>/)?.[1]);

      currentTurn.endTurnReason = reason;
      currentTurn.endTurnReasonLabel = labelForCode(END_TURN_REASON_MAP, reason, "end_turn_reason");
      currentTurn.finishingTurnType = finishingTurnType;

      registerKnownOrUnknown(unknownCodeCounters, "end_turn_reason", reason, END_TURN_REASON_MAP);

      if (reason !== undefined && reason !== 1) {
        currentTurn.possibleTurnover = true;
        currentTurn.events.push({
          type: "turnover",
          sourceTag: "EventEndTurn",
          sourceLabel: "turn_end_non_manual",
          reasonCode: reason,
          reasonLabel: labelForCode(END_TURN_REASON_MAP, reason, "end_turn_reason"),
          finishingTurnType
        });
      }

      turns.push(finalizeTurn(currentTurn));
      currentTurn = buildTurn(currentTurn.turnNumber + 1, activeGamerId);
      foundStructuredData = true;
    }
  }

  if (currentTurn.events.length > 0 || currentTurn.ballCarrierPlayerId) {
    turns.push(finalizeTurn(currentTurn));
  }

  return {
    turns: foundStructuredData ? turns : [],
    unknownCodes: Array.from(unknownCodeCounters.values()).sort((a, b) => b.occurrences - a.occurrences)
  };
}
