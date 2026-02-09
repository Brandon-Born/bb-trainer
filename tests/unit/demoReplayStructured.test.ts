import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildTimeline } from "@/domain/replay/buildTimeline";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayInput } from "@/server/services/analyzeReplay";

const DEMO_REPLAYS = ["demo1.bbr", "demo2.bbr", "demo3.bbr"] as const;

function readDemoReplay(name: (typeof DEMO_REPLAYS)[number]): string {
  return readFileSync(path.resolve(process.cwd(), "demo-replays", name), "utf-8");
}

describe("demo replay structured extraction", () => {
  for (const replayName of DEMO_REPLAYS) {
    it(`extracts typed events from ${replayName}`, () => {
      const decoded = decodeReplayInput(readDemoReplay(replayName));
      const replay = parseReplayXml(decoded.xml);

      expect(replay.turns.length).toBeGreaterThan(20);
      expect(replay.teams.length).toBeGreaterThanOrEqual(2);
      expect(replay.teams.slice(0, 2).every((team) => team.id !== "")).toBe(true);
      expect(replay.teams.slice(0, 2).every((team) => !/^\d+$/.test(team.name))).toBe(true);

      const allEvents = replay.turns.flatMap((turn) => turn.events);
      const eventTypes = new Set(allEvents.map((event) => event.type));

      expect(eventTypes.has("block")).toBe(true);
      expect(eventTypes.has("blitz")).toBe(true);
      expect(eventTypes.has("reroll")).toBe(true);
      expect(eventTypes.has("casualty")).toBe(true);

      expect(replay.turns.some((turn) => turn.possibleTurnover)).toBe(true);
      expect(replay.turns.some((turn) => turn.ballCarrierPlayerId !== undefined)).toBe(true);
    });

    it(`builds timeline metrics from ${replayName}`, () => {
      const decoded = decodeReplayInput(readDemoReplay(replayName));
      const replay = parseReplayXml(decoded.xml);
      const timeline = buildTimeline(replay);

      expect(timeline.length).toBe(replay.turns.length);
      expect(timeline.some((turn) => turn.keywordHits.block > 0)).toBe(true);
      expect(timeline.some((turn) => turn.keywordHits.reroll > 0)).toBe(true);
    });

    it(`analyzes ${replayName} through service`, () => {
      const report = analyzeReplayInput(readDemoReplay(replayName));

      expect(report.replay.turnCount).toBeGreaterThan(20);
      expect(report.analysis.metrics.totalTurns).toBe(report.replay.turnCount);
      expect(report.coaching.priorities.length).toBeGreaterThan(0);
      expect(report.teamReports.length).toBeGreaterThanOrEqual(2);
      expect(report.teamReports.every((teamReport) => teamReport.analysis.metrics.totalTurns > 0)).toBe(true);
      const firstTeam = report.teamReports[0];
      expect(firstTeam).toBeDefined();
      expect(firstTeam!.coaching.turnByTurn.every((turn) => turn.turnNumber <= 16)).toBe(true);
    });
  }

  it("detects dodge events in at least one replay", () => {
    const hasDodge = DEMO_REPLAYS.some((replayName) => {
      const decoded = decodeReplayInput(readDemoReplay(replayName));
      const replay = parseReplayXml(decoded.xml);
      return replay.turns.some((turn) => turn.events.some((event) => event.type === "dodge"));
    });

    expect(hasDodge).toBe(true);
  });
});
