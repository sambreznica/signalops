import { describe, expect, it } from "vitest";
import type { ModelClient } from "../agent/investigator";
import { assessSkills } from "./assess";
import type { AssessorPack } from "./assessor-prompt";

const pack: AssessorPack = {
  action_id: "act_1",
  description: "Run a radio characterisation.",
  risk_class: "INTERNAL",
  title: "Firmware train associated with disconnects",
  summary: "A timing change is the leading hypothesis.",
  status: "UNCERTAIN",
  severity_band: "MEDIUM",
  leading_hypothesis: "A supervisor-timing change.",
};

function clientReturning(text: string): ModelClient {
  return {
    async complete() {
      return { content: [{ type: "text", text }] };
    },
  };
}

describe("assessSkills", () => {
  it("returns skills when the emit is clean", async () => {
    const emit = await assessSkills(
      pack,
      clientReturning(
        JSON.stringify({
          skills_required: ["ble-radio", "firmware-build"],
          expertise_rationale: "Radio characterisation of a firmware train.",
        }),
      ),
    );
    expect(emit.fallback).toBe("none");
    expect(emit.skills_required).toEqual(["ble-radio", "firmware-build"]);
  });

  it("falls back without a repair round when the rationale has a figure", async () => {
    const emit = await assessSkills(
      pack,
      clientReturning(
        JSON.stringify({
          skills_required: ["ble-radio"],
          expertise_rationale: "The rate rose 12 per device-day.",
        }),
      ),
    );
    expect(emit.fallback).toBe("bare_numeral");
    expect(emit.skills_required).toEqual([]);
  });

  it("falls back on no JSON", async () => {
    const emit = await assessSkills(pack, clientReturning("not json"));
    expect(emit.fallback).toBe("no_json");
    expect(emit.skills_required).toEqual([]);
  });
});
