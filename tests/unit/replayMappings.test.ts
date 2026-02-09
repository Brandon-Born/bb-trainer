import { describe, expect, it } from "vitest";

import {
  ACTION_CODE_MAP,
  END_TURN_REASON_MAP,
  ROLL_TYPE_MAP,
  STEP_TYPE_MAP,
  labelForCode
} from "@/domain/replay/mappings";

describe("replay mappings", () => {
  it("contains critical known mappings", () => {
    expect(ACTION_CODE_MAP[2]).toBe("blitz");
    expect(ACTION_CODE_MAP[6]).toBe("foul");
    expect(STEP_TYPE_MAP[1]).toBe("dodge");
    expect(ROLL_TYPE_MAP[3]).toBe("dodge");
    expect(ROLL_TYPE_MAP[74]).toBe("bomb_scatter");
    expect(END_TURN_REASON_MAP[2]).toBe("turnover");
  });

  it("labels unknown codes predictably", () => {
    expect(labelForCode(ACTION_CODE_MAP, 999, "action")).toBe("action_unknown_999");
    expect(labelForCode(STEP_TYPE_MAP, undefined, "step")).toBe("step");
  });
});
