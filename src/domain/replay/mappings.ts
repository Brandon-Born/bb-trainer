export const STEP_TYPE_MAP: Record<number, string> = {
  0: "move",
  1: "dodge",
  2: "damage",
  3: "ball",
  4: "pickup",
  5: "pass",
  6: "block",
  10: "gfi",
  13: "throw_team_mate",
  17: "leap",
  24: "stab",
  27: "special_skill",
  29: "special_action",
  31: "chainsaw",
  32: "bomb"
};

export const ACTION_CODE_MAP: Record<number, string> = {
  1: "move",
  2: "blitz",
  3: "block",
  4: "pass",
  5: "handoff",
  6: "foul",
  15: "special",
  16: "special"
};

export const ROLL_TYPE_MAP: Record<number, string> = {
  0: "no_roll",
  1: "armor",
  2: "block_dice",
  3: "dodge",
  4: "injury",
  5: "scatter",
  6: "bounce",
  7: "ko_recovery",
  8: "kickoff_scatter",
  9: "kickoff_event",
  10: "gfi",
  11: "pickup",
  12: "catch",
  25: "interception",
  26: "touchback",
  31: "casualty",
  34: "foul_armor",
  37: "foul_injury",
  41: "regeneration",
  43: "apothecary",
  45: "weather_or_pitch",
  67: "special_rule",
  71: "secret_weapon",
  73: "bombardier",
  74: "bomb_scatter",
  87: "special_event_87",
  88: "special_event_88"
};

export const END_TURN_REASON_MAP: Record<number, string> = {
  1: "manual_end",
  2: "turnover",
  3: "forced_end",
  4: "touchdown_or_half_end"
};

export function labelForCode(map: Record<number, string>, code: number | undefined, fallback: string): string {
  if (code === undefined) {
    return fallback;
  }

  return map[code] ?? `${fallback}_unknown_${code}`;
}
