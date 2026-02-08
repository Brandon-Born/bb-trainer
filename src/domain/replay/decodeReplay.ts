import { inflateRawSync, inflateSync, gunzipSync } from "node:zlib";

import { ReplayValidationError } from "@/lib/errors";

export type ReplayInputFormat = "xml" | "bbr";

export type DecodedReplay = {
  xml: string;
  format: ReplayInputFormat;
};

const XML_START_PATTERN = /^<\?xml|^<Replay|^<MatchReplay|^</;

function decodeCompressedBase64(input: string): string | null {
  let binary: Buffer;

  try {
    binary = Buffer.from(input, "base64");
  } catch {
    return null;
  }

  if (binary.length === 0) {
    return null;
  }

  for (const decoder of [inflateSync, inflateRawSync, gunzipSync]) {
    try {
      const decoded = decoder(binary).toString("utf8");
      if (XML_START_PATTERN.test(decoded.trimStart())) {
        return decoded;
      }
    } catch {
      // Continue trying other decompressors.
    }
  }

  return null;
}

export function decodeReplayInput(input: string): DecodedReplay {
  const raw = input.trim();

  if (raw.length === 0) {
    throw new ReplayValidationError("Replay input is empty.");
  }

  if (XML_START_PATTERN.test(raw)) {
    return {
      xml: raw,
      format: "xml"
    };
  }

  const decodedXml = decodeCompressedBase64(raw);

  if (!decodedXml) {
    throw new ReplayValidationError("Replay input is not valid XML or supported BB3 .bbr content.");
  }

  return {
    xml: decodedXml,
    format: "bbr"
  };
}

