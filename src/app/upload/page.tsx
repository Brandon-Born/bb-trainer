"use client";

import { useMemo, useState } from "react";

type TurnRow = {
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
};

type TeamReport = {
  teamId: string;
  teamName: string;
  coachName?: string;
  analysis: {
    context: {
      mode: "offense" | "defense" | "mixed";
      ballControlRate: number;
    };
  };
  coaching: {
    headline: string;
    priorities: string[];
    turnByTurn: TurnRow[];
  };
};

type ReportResponse = {
  report: {
    id: string;
    generatedAt: string;
    replay: {
      matchId: string;
      replayVersion?: string;
      format: "xml" | "bbr";
      teamCount: number;
      turnCount: number;
      teams: Array<{
        id: string;
        name: string;
        coach?: string;
      }>;
      unknownCodes: Array<{
        category: "step" | "action" | "roll" | "end_turn_reason";
        code: number;
        occurrences: number;
      }>;
    };
    teamReports: TeamReport[];
  };
};

export default function UploadPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse["report"] | null>(null);
  const [coachTeamId, setCoachTeamId] = useState<string | null>(null);

  const selectedTeamReport = useMemo(() => {
    if (!report) {
      return null;
    }

    if (!coachTeamId) {
      return null;
    }

    return report.teamReports.find((teamReport) => teamReport.teamId === coachTeamId) ?? null;
  }, [report, coachTeamId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setReport(null);
    setCoachTeamId(null);

    const formData = new FormData(event.currentTarget);
    const replayFile = formData.get("replay");

    if (!(replayFile instanceof File)) {
      setError("Choose a replay file first.");
      return;
    }

    setIsLoading(true);
    setStatus("Uploading replay...");

    try {
      const uploadData = new FormData();
      uploadData.append("replay", replayFile);

      setStatus("Reading replay and building coaching tips...");
      const response = await fetch("/api/replay", {
        method: "POST",
        body: uploadData
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Replay analysis failed.");
      }

      const body = (await response.json()) as ReportResponse;
      setReport(body.report);

      if (body.report.teamReports.length === 1) {
        setCoachTeamId(body.report.teamReports[0]?.teamId ?? null);
      }

      setStatus("Done. Pick your team to see coaching advice.");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unexpected error.";
      setError(message);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }

  function confidenceBadgeClass(confidence: TurnRow["confidence"]): string {
    if (confidence === "high") {
      return "bg-red-700/80 text-red-100 border-red-300/40";
    }

    if (confidence === "medium") {
      return "bg-amber-700/70 text-amber-100 border-amber-200/40";
    }

    return "bg-emerald-700/70 text-emerald-100 border-emerald-200/40";
  }

  function contextLabel(mode: TeamReport["analysis"]["context"]["mode"]): string {
    if (mode === "offense") {
      return "Mostly offense";
    }

    if (mode === "defense") {
      return "Mostly defense";
    }

    return "Mixed drive";
  }

  function formatEvidenceItem(item: TurnRow["evidence"][number]): string {
    const parts = [item.eventType, item.sourceTag, item.code, item.detail].filter(Boolean);
    if (parts.length === 0) {
      return "Replay marker";
    }

    return parts.join(" | ");
  }

  return (
    <main className="bb-shell mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-16">
      <section className="space-y-3">
        <p className="inline-flex rounded-full border border-amber-300/60 bg-amber-100/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900">
          Blood Bowl Coach Room
        </p>
        <h1 className="text-4xl font-black tracking-tight text-amber-100">Replay Coach</h1>
        <p className="max-w-3xl text-sm text-amber-50/90">
          One shot flow: upload your replay, choose your team, read simple coaching tips, then upload the next game.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="rounded-xl border border-amber-300/30 bg-black/35 p-6 shadow-xl backdrop-blur">
        <label className="block space-y-2 text-sm font-medium text-amber-100">
          <span>Replay file (.xml or .bbr)</span>
          <input
            className="block w-full rounded-md border border-amber-200/40 bg-black/30 px-3 py-2 text-sm text-amber-50"
            type="file"
            name="replay"
            accept=".xml,.bbr,text/xml,application/xml"
            required
          />
        </label>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Working..." : "Analyze Replay"}
          </button>

          {report ? (
            <button
              type="button"
              onClick={() => {
                setReport(null);
                setError(null);
                setStatus(null);
                setCoachTeamId(null);
              }}
              className="rounded-lg border border-amber-200/40 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-100/10"
            >
              Upload Another Replay
            </button>
          ) : null}
        </div>

        {status ? <p className="mt-3 text-xs text-amber-100/90">{status}</p> : null}
      </form>

      {error ? (
        <section className="rounded-lg border border-red-300/60 bg-red-900/30 px-4 py-3 text-sm text-red-100">{error}</section>
      ) : null}

      {report ? (
        <section className="space-y-6 rounded-xl border border-amber-300/30 bg-black/35 p-6 shadow-xl backdrop-blur">
          <header className="space-y-2">
            <h2 className="text-xl font-bold text-amber-100">Match Coaching</h2>
            <p className="text-xs text-amber-100/80">Generated at {new Date(report.generatedAt).toLocaleString()}</p>
            <p className="text-xs text-amber-100/80">
              Match: {report.replay.matchId} | Format: {report.replay.format.toUpperCase()} | Version: {report.replay.replayVersion ?? "unknown"}
            </p>
          </header>

          {report.teamReports.length > 1 ? (
            <div className="space-y-2 rounded-lg border border-amber-300/20 bg-amber-950/20 p-4">
              <label className="block text-sm font-semibold text-amber-100">Which team are you coaching?</label>
              <select
                value={coachTeamId ?? ""}
                onChange={(event) => setCoachTeamId(event.target.value || null)}
                className="w-full rounded-md border border-amber-200/40 bg-black/40 px-3 py-2 text-sm text-amber-50"
              >
                <option value="">Select your team...</option>
                {report.teamReports.map((teamReport) => (
                  <option key={teamReport.teamId} value={teamReport.teamId}>
                    {teamReport.coachName ? `${teamReport.teamName} (Coach: ${teamReport.coachName})` : teamReport.teamName}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {!selectedTeamReport ? (
            <p className="text-sm text-amber-100/90">Choose your team to view turn-by-turn advice.</p>
          ) : (
            <>
              <div>
                <h3 className="text-lg font-semibold text-amber-100">Advice for {selectedTeamReport.teamName}</h3>
                <p className="mt-1 text-sm text-amber-50/90">{selectedTeamReport.coaching.headline}</p>
                <p className="mt-2 text-xs text-amber-100/85">
                  Learning mode: {contextLabel(selectedTeamReport.analysis.context.mode)} ({Math.round(selectedTeamReport.analysis.context.ballControlRate * 100)}%
                  ball control on your tracked turns)
                </p>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-amber-100">Top things to improve</h4>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-50/90">
                  {selectedTeamReport.coaching.priorities.map((priority) => (
                    <li key={priority}>{priority}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-amber-100">Turn by turn help</h4>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm text-amber-50">
                    <thead>
                      <tr className="border-b border-amber-300/20 text-left">
                        <th className="px-2 py-2">Turn</th>
                        <th className="px-2 py-2">What happened</th>
                        <th className="px-2 py-2">Confidence</th>
                        <th className="px-2 py-2">Why this was risky</th>
                        <th className="px-2 py-2">Better play next time</th>
                        <th className="px-2 py-2">Replay clues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTeamReport.coaching.turnByTurn.map((turn) => (
                        <tr key={`${turn.turnNumber}-${turn.happened}`} className="border-b border-amber-300/10 align-top" id={`turn-${turn.turnNumber}`}>
                          <td className="px-2 py-3 font-semibold">{turn.turnNumber}</td>
                          <td className="px-2 py-3">{turn.happened}</td>
                          <td className="px-2 py-3">
                            <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold uppercase ${confidenceBadgeClass(turn.confidence)}`}>
                              {turn.confidence}
                            </span>
                          </td>
                          <td className="px-2 py-3">{turn.riskyBecause}</td>
                          <td className="px-2 py-3">{turn.saferAlternative}</td>
                          <td className="px-2 py-3">
                            {turn.evidence.length === 0 ? (
                              <span className="text-amber-100/70">No replay clues attached</span>
                            ) : (
                              <ul className="list-disc space-y-1 pl-4 text-xs text-amber-100/85">
                                {turn.evidence.slice(0, 3).map((evidence, index) => (
                                  <li key={`${turn.turnNumber}-${index}-${evidence.sourceTag ?? "marker"}`}>{formatEvidenceItem(evidence)}</li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {report.replay.unknownCodes.length > 0 ? (
            <div className="rounded-md border border-amber-300/30 bg-amber-900/20 p-3 text-xs text-amber-100">
              Some replay codes are still unknown. The parser handled this match, but code mapping can improve further.
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
