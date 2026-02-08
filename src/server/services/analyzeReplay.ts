import { createHash } from "node:crypto";

import { analyzeReplayTimeline } from "@/domain/analysis/heuristics";
import { renderCoaching } from "@/domain/coaching/renderAdvice";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { buildTimeline } from "@/domain/replay/buildTimeline";
import { parseReplayXml } from "@/domain/replay/parseXml";

export type ReplayAnalysisReport = {
  id: string;
  generatedAt: string;
  replay: {
    matchId: string;
    teamCount: number;
    turnCount: number;
  };
  analysis: ReturnType<typeof analyzeReplayTimeline>;
  coaching: ReturnType<typeof renderCoaching>;
};

function buildReportId(xml: string): string {
  return createHash("sha1").update(xml).digest("hex").slice(0, 12);
}

export function analyzeReplayXml(xml: string): ReplayAnalysisReport {
  const replay = parseReplayXml(xml);
  const timeline = buildTimeline(replay);
  const analysis = analyzeReplayTimeline(timeline);
  const coaching = renderCoaching(analysis);

  return {
    id: buildReportId(xml),
    generatedAt: new Date().toISOString(),
    replay: {
      matchId: replay.matchId,
      teamCount: replay.teams.length,
      turnCount: replay.turns.length
    },
    analysis,
    coaching
  };
}

export function analyzeReplayInput(input: string): ReplayAnalysisReport {
  const decoded = decodeReplayInput(input);
  return analyzeReplayXml(decoded.xml);
}
