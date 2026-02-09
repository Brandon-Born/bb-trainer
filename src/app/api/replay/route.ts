import { NextResponse } from "next/server";

import { ReplayValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { appConfig } from "@/lib/config";
import { analyzeReplayInput } from "@/server/services/analyzeReplay";

export const runtime = "nodejs";

function hasAllowedExtension(name: string): boolean {
  return name.endsWith(".xml") || name.endsWith(".bbr");
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read upload form data. Please try uploading the replay again." }, { status: 400 });
  }

  const replayFile = formData.get("replay");

  if (!(replayFile instanceof File)) {
    return NextResponse.json({ error: "A replay file is required." }, { status: 400 });
  }

  const fileName = replayFile.name.toLowerCase();
  if (!hasAllowedExtension(fileName)) {
    return NextResponse.json({ error: "Unsupported replay file type. Upload .xml or .bbr files." }, { status: 400 });
  }

  if (replayFile.size > appConfig.maxReplayBytes) {
    return NextResponse.json(
      { error: `Replay file too large. Max size is ${Math.floor(appConfig.maxReplayBytes / (1024 * 1024))}MB.` },
      { status: 413 }
    );
  }

  let replayInput = "";
  try {
    replayInput = await replayFile.text();
  } catch {
    return NextResponse.json({ error: "Could not read the replay file. Please try another file." }, { status: 400 });
  }

  if (replayInput.trim().length === 0) {
    return NextResponse.json({ error: "Replay file is empty." }, { status: 400 });
  }

  try {
    const startedAt = Date.now();
    const report = analyzeReplayInput(replayInput, {
      maxDecodedChars: appConfig.maxDecodedReplayChars
    });
    const analyzeDuration = Date.now() - startedAt;

    if (analyzeDuration > appConfig.maxAnalyzeDurationMs) {
      logger.info("Replay analysis exceeded duration budget", {
        reportId: report.id,
        durationMs: analyzeDuration,
        budgetMs: appConfig.maxAnalyzeDurationMs
      });

      return NextResponse.json(
        { error: "Replay analysis took too long. Try a smaller replay or trim long overtime games." },
        { status: 413 }
      );
    }

    if (report.replay.unknownCodes.length > 0) {
      logger.info("Replay contains unknown mapping codes", {
        reportId: report.id,
        unknownCodes: report.replay.unknownCodes.slice(0, 10)
      });
    }

    if (report.analysis.findings.length === 0) {
      logger.info("Replay produced no coaching findings", {
        reportId: report.id,
        turnCount: report.replay.turnCount
      });
    }

    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof ReplayValidationError) {
      const friendlyError = /parse failed/i.test(error.message)
        ? "Replay format was not readable. Please upload a valid BB3 .bbr or XML replay file."
        : error.message;
      return NextResponse.json({ error: friendlyError }, { status: 400 });
    }

    logger.error("Unexpected replay analysis error", {
      error: error instanceof Error ? error.message : "Unknown error"
    });

    return NextResponse.json({ error: "Failed to analyze replay." }, { status: 500 });
  }
}
