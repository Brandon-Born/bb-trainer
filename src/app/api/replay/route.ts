import { NextResponse } from "next/server";

import { ReplayValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { appConfig } from "@/lib/config";
import { analyzeReplayInput } from "@/server/services/analyzeReplay";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const replayFile = formData.get("replay");

  if (!(replayFile instanceof File)) {
    return NextResponse.json({ error: "A replay file is required." }, { status: 400 });
  }

  if (replayFile.size > appConfig.maxReplayBytes) {
    return NextResponse.json(
      { error: `Replay file too large. Max size is ${Math.floor(appConfig.maxReplayBytes / (1024 * 1024))}MB.` },
      { status: 413 }
    );
  }

  const xml = await replayFile.text();

  try {
    const report = analyzeReplayInput(xml);
    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof ReplayValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logger.error("Unexpected replay analysis error", {
      error: error instanceof Error ? error.message : "Unknown error"
    });

    return NextResponse.json({ error: "Failed to analyze replay." }, { status: 500 });
  }
}
