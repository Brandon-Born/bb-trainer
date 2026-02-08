import { XMLParser } from "fast-xml-parser";

import type { ReplayEvent, ReplayTurn } from "@/domain/replay/types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: true,
  trimValues: true
});

const STRUCTURED_TOKEN_REGEX = /<(EventExecuteSequence|EventEndTurn|EventActiveGamerChanged|Carrier)>([\s\S]*?)<\/\1>/g;
const STEP_MESSAGE_DATA_REGEX = /<Step><Name>[^<]*<\/Name><MessageData>([^<]*)<\/MessageData>/;
const RESULT_MESSAGE_DATA_REGEX = /<StringMessage><Name>[^<]*<\/Name><MessageData>([^<]*)<\/MessageData><\/StringMessage>/g;

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

function collectSequenceEvents(block: string): ReplayEvent[] {
  const events: ReplayEvent[] = [];

  const stepMessageData = block.match(STEP_MESSAGE_DATA_REGEX)?.[1];
  const stepDecodedXml = stepMessageData ? decodeBase64Chain(stepMessageData) : "";
  const stepParsed = stepDecodedXml.startsWith("<") ? parseDecodedXml(stepDecodedXml) : null;
  const stepRootTag = stepParsed ? Object.keys(stepParsed)[0] : undefined;
  const stepPayload = stepRootTag ? (stepParsed?.[stepRootTag] as Record<string, unknown> | undefined) : undefined;

  const sequenceContext = {
    stepType: toNumber(stepPayload?.StepType),
    playerId: toStringValue(stepPayload?.PlayerId),
    targetId: toStringValue(stepPayload?.TargetId),
    teamId: toStringValue(stepPayload?.TeamId),
    gamerId: toStringValue(stepPayload?.GamerId)
  };

  if (stepRootTag === "BallStep") {
    events.push({
      type: "ball_state",
      sourceTag: "BallStep",
      stepType: sequenceContext.stepType,
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

    if (rootTag === "ResultBlockRoll" || rootTag === "ResultBlockOutcome" || rootTag === "ResultPushBack") {
      events.push({ type: "block", sourceTag: rootTag, stepType, playerId, targetId, teamId, gamerId, payload });
    }

    if (rootTag === "ResultUseAction" && actionCode === 2) {
      events.push({ type: "blitz", sourceTag: rootTag, stepType, playerId, targetId, teamId, gamerId, actionCode, payload });
    }

    if (rootTag === "ResultRoll" && sequenceContext.stepType === 1) {
      events.push({ type: "dodge", sourceTag: rootTag, stepType, playerId, targetId, teamId, gamerId, payload });
    }

    if (rootTag === "QuestionTeamRerollUsage" || rootTag === "ResultTeamRerollUsage") {
      events.push({ type: "reroll", sourceTag: rootTag, stepType, playerId, targetId, teamId, gamerId, payload });
    }

    if (rootTag === "ResultInjuryRoll" || rootTag === "ResultCasualtyRoll" || rootTag === "ResultPlayerRemoval") {
      events.push({ type: "casualty", sourceTag: rootTag, stepType, playerId, targetId, teamId, gamerId, payload });
    }

    if (rootTag === "BallStep" || rootTag === "ResultTouchBack") {
      events.push({ type: "ball_state", sourceTag: rootTag, stepType, playerId, targetId, teamId, gamerId, payload });
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
    finishingTurnType: undefined,
    events: [],
    actionTexts: [],
    eventCount: 0,
    raw: {}
  };
}

function finalizeTurn(turn: ReplayTurn): ReplayTurn {
  const actionTexts = turn.events
    .flatMap((event) => [event.type, event.sourceTag])
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

export function extractStructuredTurnsFromReplayXml(xml: string): ReplayTurn[] {
  const turns: ReplayTurn[] = [];

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
          playerId: carrierId
        });
      }

      foundStructuredData = true;
      continue;
    }

    if (tag === "EventExecuteSequence") {
      const sequenceEvents = collectSequenceEvents(body);
      applySequenceEventsToTurn(currentTurn, sequenceEvents);

      foundStructuredData = true;
      continue;
    }

    if (tag === "EventEndTurn") {
      const reason = toNumber(body.match(/<Reason>(-?\d+)<\/Reason>/)?.[1]);
      const finishingTurnType = toNumber(body.match(/<FinishingTurnType>(-?\d+)<\/FinishingTurnType>/)?.[1]);

      currentTurn.endTurnReason = reason;
      currentTurn.finishingTurnType = finishingTurnType;

      // BB3 replay end-turn reasons 2/4 generally indicate non-manual turn termination events.
      if (reason !== undefined && reason !== 1) {
        currentTurn.possibleTurnover = true;
        currentTurn.events.push({
          type: "turnover",
          sourceTag: "EventEndTurn",
          reasonCode: reason,
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

  return foundStructuredData ? turns : [];
}
