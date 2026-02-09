import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { decodeReplayInput } from "@/domain/replay/decodeReplay";

function readFixture(name: string): string {
  return readFileSync(path.resolve(process.cwd(), "tests", "fixtures", "replays", name), "utf-8");
}

function readDemoReplay(): string {
  return readFileSync(path.resolve(process.cwd(), "demo-replays", "demo1.bbr"), "utf-8");
}

describe("decodeReplayInput", () => {
  it("passes through xml input", () => {
    const decoded = decodeReplayInput(readFixture("sample-basic.xml"));

    expect(decoded.format).toBe("xml");
    expect(decoded.xml.startsWith("<MatchReplay>")).toBe(true);
  });

  it("decodes BB3 bbr payload into xml", () => {
    const decoded = decodeReplayInput(readDemoReplay());

    expect(decoded.format).toBe("bbr");
    expect(decoded.xml.startsWith("<Replay>")).toBe(true);
    expect(decoded.xml.length).toBeGreaterThan(100000);
  });

  it("rejects decoded replays above configured max characters", () => {
    const input = readDemoReplay();

    expect(() => decodeReplayInput(input, { maxDecodedChars: 1000 })).toThrow(/too large/i);
  });
});
