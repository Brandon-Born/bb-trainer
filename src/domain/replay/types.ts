export type ReplayTeam = {
  id: string;
  name: string;
  coach?: string;
};

export type ReplayEventType =
  | "block"
  | "blitz"
  | "dodge"
  | "reroll"
  | "casualty"
  | "ball_state"
  | "turnover";

export type ReplayEvent = {
  type: ReplayEventType;
  sourceTag: string;
  playerId?: string;
  targetId?: string;
  teamId?: string;
  gamerId?: string;
  actionCode?: number;
  stepType?: number;
  reasonCode?: number;
  finishingTurnType?: number;
  payload?: Record<string, unknown>;
};

export type ReplayTurn = {
  turnNumber: number;
  teamId?: string;
  gamerId?: string;
  ballCarrierPlayerId?: string;
  possibleTurnover: boolean;
  endTurnReason?: number;
  finishingTurnType?: number;
  events: ReplayEvent[];
  actionTexts: string[];
  eventCount: number;
  raw: unknown;
};

export type ReplayModel = {
  matchId: string;
  rootTag: string;
  teams: ReplayTeam[];
  turns: ReplayTurn[];
  raw: unknown;
};

export type TimelineTurn = {
  turnNumber: number;
  teamId?: string;
  rawEventCount: number;
  keywordHits: {
    turnover: number;
    reroll: number;
    blitz: number;
    dodge: number;
    block: number;
  };
};
