import { inflateRawSync, inflateSync, gunzipSync } from "node:zlib";

import { ReplayValidationError } from "@/lib/errors";

export type ReplayInputFormat = "xml" | "bbr";

export type DecodedReplay = {
  xml: string;
  format: ReplayInputFormat;
};

export type DecodeReplayOptions = {
  maxDecodedChars?: number;
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

export function decodeReplayInput(input: string, options: DecodeReplayOptions = {}): DecodedReplay {
  const raw = input.trim();

  if (raw.length === 0) {
    throw new ReplayValidationError("Replay input is empty.");
  }

  if (XML_START_PATTERN.test(raw)) {
    if (options.maxDecodedChars && raw.length > options.maxDecodedChars) {
      throw new ReplayValidationError(`Replay XML is too large after decode. Max size is ${options.maxDecodedChars} characters.`);
    }

    return {
      xml: raw,
      format: "xml"
    };
  }

  const decodedXml = decodeCompressedBase64(raw);

  if (!decodedXml) {
    throw new ReplayValidationError("Replay input is not valid XML or supported BB3 .bbr content.");
  }

  if (options.maxDecodedChars && decodedXml.length > options.maxDecodedChars) {
    throw new ReplayValidationError(`Replay XML is too large after decode. Max size is ${options.maxDecodedChars} characters.`);
  }

  return {
    xml: decodedXml,
    format: "bbr"
  };
}
