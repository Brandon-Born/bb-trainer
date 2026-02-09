import type { AnalysisResult } from "@/domain/analysis/types";
import { summarizeMatch } from "@/domain/analysis/summarizeMatch";

export type CoachingReport = {
  headline: string;
  priorities: string[];
  turnByTurn: Array<{
    turnNumber: number;
    happened: string;
    riskyBecause: string;
    saferAlternative: string;
    confidence: "low" | "medium" | "high";
    evidence: Array<{
      eventType?: string;
      sourceTag?: string;
      code?: string;
      detail?: string;
    }>;
  }>;
};

export function renderCoaching(analysis: AnalysisResult): CoachingReport {
  const headline = summarizeMatch(analysis);

  const priorities = analysis.findings.slice(0, 5).map((finding) => {
    const turnRef = finding.turnNumber ? `Turn ${finding.turnNumber}` : "Match";
    return `${turnRef} - ${finding.title}: ${finding.recommendation}`;
  });

  if (priorities.length === 0) {
    priorities.push("No major mistakes were found in this replay. Keep practicing the same safe turn order.");
  }

  const turnByTurn = analysis.turnAdvice.slice(0, 32).map((advice) => ({
    turnNumber: advice.turnNumber,
    happened: advice.happened,
    riskyBecause: advice.riskyBecause,
    saferAlternative: advice.saferAlternative,
    confidence: advice.confidence,
    evidence: advice.evidence
  }));

  return {
    headline,
    priorities,
    turnByTurn
  };
}
