import { describe, expect, it } from "vitest";

import { evaluateBallSafety, evaluateCageSafety } from "@/domain/analysis/rules";
import type { ReplayModel } from "@/domain/replay/types";

function baseReplay(): ReplayModel {
  return {
    matchId: "fixture-linking",
    rootTag: "Replay",
    teams: [
      { id: "0", name: "Team Zero" },
      { id: "1", name: "Team One" }
    ],
    playerNamesByTeamAndId: {
      "0:9": "Own Star",
      "1:9": "Enemy Star",
      "1:7": "Enemy Carrier"
    },
    playerNamesById: {},
    turns: [],
    unknownCodes: [],
    raw: {}
  };
}

describe("rules player linking", () => {
  it("uses active team player name when player ids overlap across teams", () => {
    const replay = baseReplay();
    replay.turns = [
      {
        turnNumber: 1,
        teamId: "0",
        ballCarrierPlayerId: "9",
        gamerId: "0",
        possibleTurnover: false,
        endTurnReason: undefined,
        endTurnReasonLabel: undefined,
        finishingTurnType: undefined,
        events: [
          { type: "dodge", sourceTag: "ResultRoll", playerId: "9", teamId: "0" },
          { type: "dodge", sourceTag: "ResultRoll", playerId: "9", teamId: "0" }
        ],
        actionTexts: [],
        eventCount: 2,
        raw: {}
      }
    ];

    const findings = evaluateCageSafety(replay, {
      mode: "offense",
      offenseTurns: 1,
      defenseTurns: 0,
      ballControlRate: 1
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain("Own Star");
    expect(findings[0]?.title).not.toContain("Enemy Star");
  });

  it("flags when opponent takes the ball between your turns", () => {
    const replay = baseReplay();
    replay.turns = [
      {
        turnNumber: 1,
        teamId: "0",
        ballCarrierPlayerId: "9",
        gamerId: "0",
        possibleTurnover: false,
        endTurnReason: undefined,
        endTurnReasonLabel: undefined,
        finishingTurnType: undefined,
        events: [],
        actionTexts: [],
        eventCount: 0,
        raw: {}
      },
      {
        turnNumber: 2,
        teamId: "0",
        ballCarrierPlayerId: "7",
        gamerId: "0",
        possibleTurnover: false,
        endTurnReason: undefined,
        endTurnReasonLabel: undefined,
        finishingTurnType: undefined,
        events: [],
        actionTexts: [],
        eventCount: 0,
        raw: {}
      }
    ];

    const findings = evaluateBallSafety(replay, {
      mode: "mixed",
      offenseTurns: 1,
      defenseTurns: 1,
      ballControlRate: 0.5
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("high");
    expect(findings[0]?.title).toContain("opponent took the ball from Own Star");
  });
});
