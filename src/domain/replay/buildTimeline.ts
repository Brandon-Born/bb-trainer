import type { ReplayModel, TimelineTurn } from "@/domain/replay/types";

const KEYWORD_PATTERNS = {
  turnover: /\bturn ?over\b/g,
  reroll: /\bre ?-?roll\b|\breroll\b/g,
  blitz: /\bblitz(?:ed|ing|es)?\b/g,
  dodge: /\bdodge(?:d|s|ing)?\b/g,
  block: /\bblock(?:ed|ing|s)?\b/g
} as const;

function countPatternMatches(input: string, pattern: RegExp): number {
  const matches = input.match(pattern);
  return matches ? matches.length : 0;
}

export function buildTimeline(replay: ReplayModel): TimelineTurn[] {
  return replay.turns.map((turn) => {
    const combinedText = `${JSON.stringify(turn.raw).toLowerCase()} ${turn.actionTexts.join(" ")}`;
    const typedCounts = turn.events.reduce(
      (acc, event) => {
        if (event.type === "turnover") {
          acc.turnover += 1;
        }
        if (event.type === "reroll") {
          acc.reroll += 1;
        }
        if (event.type === "blitz") {
          acc.blitz += 1;
        }
        if (event.type === "dodge") {
          acc.dodge += 1;
        }
        if (event.type === "block") {
          acc.block += 1;
        }

        return acc;
      },
      {
        turnover: 0,
        reroll: 0,
        blitz: 0,
        dodge: 0,
        block: 0
      }
    );

    return {
      turnNumber: turn.turnNumber,
      teamId: turn.teamId,
      rawEventCount: Math.max(turn.eventCount, 1),
      keywordHits: {
        turnover: Math.max(typedCounts.turnover, countPatternMatches(combinedText, KEYWORD_PATTERNS.turnover)),
        reroll: Math.max(typedCounts.reroll, countPatternMatches(combinedText, KEYWORD_PATTERNS.reroll)),
        blitz: Math.max(typedCounts.blitz, countPatternMatches(combinedText, KEYWORD_PATTERNS.blitz)),
        dodge: Math.max(typedCounts.dodge, countPatternMatches(combinedText, KEYWORD_PATTERNS.dodge)),
        block: Math.max(typedCounts.block, countPatternMatches(combinedText, KEYWORD_PATTERNS.block))
      }
    };
  });
}
