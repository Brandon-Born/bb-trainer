import type { AnalysisResult } from "@/domain/analysis/types";

export function summarizeMatch(analysis: AnalysisResult): string {
  const { metrics, findings } = analysis;

  if (metrics.totalTurns === 0) {
    return "We could not read turns from this replay. Try another file.";
  }

  const highestSeverityFinding = findings.find((finding) => finding.severity === "high");
  if (highestSeverityFinding) {
    return `${highestSeverityFinding.title}. ${highestSeverityFinding.detail}`;
  }

  return `Checked ${metrics.totalTurns} turns and found ${findings.length} coaching tips to improve your next match.`;
}
