import { describe, expect, it } from "vitest";

import { analyzeReplayTimeline } from "@/domain/analysis/heuristics";
import { buildTimeline } from "@/domain/replay/buildTimeline";
import type { ReplayModel, ReplayTurn } from "@/domain/replay/types";
import { scopeReplayToTeam } from "@/server/services/analyzeReplay";

function buildTurn(turnNumber: number, playerId: string): ReplayTurn {
  return {
    turnNumber,
    teamId: "0",
    gamerId: "0",
    ballCarrierPlayerId: playerId,
    possibleTurnover: false,
    endTurnReason: undefined,
    endTurnReasonLabel: undefined,
    finishingTurnType: undefined,
    events: [
      { type: "dodge", sourceTag: "ResultRoll", playerId, teamId: "0" },
      { type: "dodge", sourceTag: "ResultRoll", playerId, teamId: "0" }
    ],
    actionTexts: ["dodge"],
    eventCount: 2,
    raw: {}
  };
}

function buildReplay(turns: ReplayTurn[]): ReplayModel {
  return {
    matchId: "scope-fixture",
    rootTag: "Replay",
    teams: [
      { id: "0", name: "Hairy Bush" },
      { id: "1", name: "I Nurgle ALOT" }
    ],
    playerNamesByTeamAndId: {
      "0:3": "Sir Chugs-a-Lot",
      "1:50": "The Rizzler"
    },
    playerNamesById: {
      "3": "Sir Chugs-a-Lot",
      "50": "The Rizzler"
    },
    turns,
    unknownCodes: [],
    raw: {}
  };
}

describe("team scoping", () => {
  it("filters opponent-owned players and carrier data from the scoped replay", () => {
    const replay = buildReplay([buildTurn(1, "3"), buildTurn(2, "3")]);

    const scoped = scopeReplayToTeam(replay, "1");

    expect(scoped.analysisTeamId).toBe("1");
    expect(scoped.turns.length).toBeGreaterThan(0);
    expect(scoped.turns.every((turn) => turn.teamId === "1")).toBe(true);
    expect(scoped.turns.every((turn) => turn.ballCarrierPlayerId !== "3")).toBe(true);
    expect(scoped.turns.every((turn) => turn.events.every((event) => event.playerId !== "3"))).toBe(true);
  });

  it("prevents opponent player names from appearing in scoped findings", () => {
    const replay = buildReplay([buildTurn(1, "3"), buildTurn(2, "3")]);
    const scoped = scopeReplayToTeam(replay, "1");

    const timeline = buildTimeline(scoped);
    const analysis = analyzeReplayTimeline(scoped, timeline);

    expect(analysis.findings.some((finding) => finding.title.includes("Sir Chugs-a-Lot"))).toBe(false);
  });
});
