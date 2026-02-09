import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";

const DEMO_REPLAYS = ["demo1.bbr", "demo2.bbr", "demo3.bbr"] as const;

function readDemoReplay(name: (typeof DEMO_REPLAYS)[number]): string {
  return readFileSync(path.resolve(process.cwd(), "demo-replays", name), "utf-8");
}

function decodeBase64Twice(value: string): string {
  let current = value;

  for (let i = 0; i < 2; i += 1) {
    current = Buffer.from(current, "base64").toString("utf8");
  }

  return current;
}

type ReferenceCounts = {
  block: number;
  blitz: number;
  foul: number;
  dodge: number;
  reroll: number;
  casualty: number;
  turnover: number;
};

function extractReferenceCounts(xml: string): ReferenceCounts {
  const counts: ReferenceCounts = {
    block: 0,
    blitz: 0,
    foul: 0,
    dodge: 0,
    reroll: 0,
    casualty: 0,
    turnover: 0
  };

  const endTurnRegex = /<EventEndTurn>([\s\S]*?)<\/EventEndTurn>/g;
  for (const match of xml.matchAll(endTurnRegex)) {
    const reason = Number(match[1].match(/<Reason>(-?\d+)<\/Reason>/)?.[1] ?? "NaN");
    if (Number.isFinite(reason) && reason !== 1) {
      counts.turnover += 1;
    }
  }

  const sequenceRegex = /<EventExecuteSequence>([\s\S]*?)<\/EventExecuteSequence>/g;
  for (const match of xml.matchAll(sequenceRegex)) {
    const block = match[1];
    const stepMessageData = block.match(/<Step><Name>[^<]*<\/Name><MessageData>([^<]*)<\/MessageData>/)?.[1];
    const stepXml = stepMessageData ? decodeBase64Twice(stepMessageData) : "";
    const stepType = Number(stepXml.match(/<StepType>(-?\d+)<\/StepType>/)?.[1] ?? "NaN");

    const results = Array.from(
      block.matchAll(/<StringMessage><Name>[^<]*<\/Name><MessageData>([^<]*)<\/MessageData><\/StringMessage>/g)
    ).map((resultMatch) => decodeBase64Twice(resultMatch[1]));

    for (const resultXml of results) {
      const resultTag = resultXml.match(/^<([A-Za-z0-9_:-]+)/)?.[1];
      if (!resultTag) {
        continue;
      }

      if (resultTag === "ResultBlockRoll" || resultTag === "ResultBlockOutcome" || resultTag === "ResultPushBack") {
        counts.block += 1;
      }

      if (resultTag === "ResultUseAction") {
        const action = Number(resultXml.match(/<Action>(-?\d+)<\/Action>/)?.[1] ?? "NaN");
        if (action === 2) {
          counts.blitz += 1;
        }
        if (action === 6) {
          counts.foul += 1;
        }
      }

      if (resultTag === "ResultFoulRoll" || resultTag === "ResultFoulOutcome") {
        counts.foul += 1;
      }

      if (resultTag === "ResultRoll" && stepType === 1) {
        counts.dodge += 1;
      }

      if (resultTag === "QuestionTeamRerollUsage" || resultTag === "ResultTeamRerollUsage") {
        counts.reroll += 1;
      }

      if (resultTag === "ResultInjuryRoll" || resultTag === "ResultCasualtyRoll" || resultTag === "ResultPlayerRemoval") {
        counts.casualty += 1;
      }
    }
  }

  return counts;
}

function extractParsedCounts(xml: string): ReferenceCounts {
  const replay = parseReplayXml(xml);
  const allEvents = replay.turns.flatMap((turn) => turn.events);

  return {
    block: allEvents.filter((event) => event.type === "block").length,
    blitz: allEvents.filter((event) => event.type === "blitz").length,
    foul: allEvents.filter((event) => event.type === "foul").length,
    dodge: allEvents.filter((event) => event.type === "dodge").length,
    reroll: allEvents.filter((event) => event.type === "reroll").length,
    casualty: allEvents.filter((event) => event.type === "casualty").length,
    turnover: replay.turns.filter((turn) => turn.possibleTurnover).length
  };
}

describe("replay implementation baseline", () => {
  for (const replayName of DEMO_REPLAYS) {
    it(`matches independent extraction counts for ${replayName}`, () => {
      const decoded = decodeReplayInput(readDemoReplay(replayName));

      const expected = extractReferenceCounts(decoded.xml);
      const actual = extractParsedCounts(decoded.xml);

      expect(actual).toEqual(expected);
      expect(actual.block).toBeGreaterThan(0);
      expect(actual.reroll).toBeGreaterThan(0);
      expect(actual.casualty).toBeGreaterThan(0);
    });
  }
});
