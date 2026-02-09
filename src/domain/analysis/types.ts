export type AnalysisSeverity = "low" | "medium" | "high";

export type AnalysisCategory =
  | "turnover_cause"
  | "reroll_timing"
  | "action_ordering"
  | "ball_safety"
  | "cage_safety"
  | "screen_lanes"
  | "blitz_value"
  | "foul_timing";

export type AnalysisEvidence = {
  eventType?: string;
  sourceTag?: string;
  code?: string;
  detail?: string;
};

export type AnalysisFinding = {
  id: string;
  severity: AnalysisSeverity;
  category: AnalysisCategory;
  title: string;
  detail: string;
  recommendation: string;
  turnNumber?: number;
  evidence: AnalysisEvidence[];
};

export type TurnAdvice = {
  turnNumber: number;
  happened: string;
  riskyBecause: string;
  saferAlternative: string;
  confidence: "low" | "medium" | "high";
  evidence: AnalysisEvidence[];
};

export type AnalysisMetrics = {
  totalTurns: number;
  turnoverSignals: number;
  rerollSignals: number;
  aggressiveActionSignals: number;
  ballCarrierTransitions: number;
  blitzSignals: number;
  foulSignals: number;
};

export type TeamContext = {
  mode: "offense" | "defense" | "mixed";
  offenseTurns: number;
  defenseTurns: number;
  ballControlRate: number;
};

export type AnalysisResult = {
  context: TeamContext;
  metrics: AnalysisMetrics;
  findings: AnalysisFinding[];
  turnAdvice: TurnAdvice[];
};
