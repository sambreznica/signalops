import { describe, expect, it } from "vitest";
import {
  claimDisciplineErrors,
  freeTextEntries,
  freeTextFields,
  hasBareNumeral,
  orphanFindingRefs,
  renderFindingRefs,
  stripIdentifiers,
} from "../src/lib/schema/prose";
import { makeInvestigation } from "./make-output";

describe("EVAL-04b identifier grammar", () => {
  it("allows metric names, incident ids, known-issue ids, versions, and KD-ids", () => {
    expect(
      hasBareNumeral(
        "ble_disconnects_24h on firmware 1.4.2 per INC-2025-002 and KI-NW-014 in KD-02",
      ),
    ).toBe(false);
  });

  it("allows a finding reference without admitting the figure", () => {
    expect(hasBareNumeral("rate rose to {f_1} against a baseline of {f_2}")).toBe(
      false,
    );
  });

  it("does not admit a bare count", () => {
    expect(hasBareNumeral("saw 12 disconnects overnight")).toBe(true);
  });

  it("does not admit a multiplier, a percent, a duration, or ratio-near-one", () => {
    expect(hasBareNumeral("roughly 6.8x higher ble_disconnects_24h on 1.4.2")).toBe(
      true,
    );
    expect(hasBareNumeral("100% of devices on 1.4.2 also run app 3.2")).toBe(true);
    expect(hasBareNumeral("timeout from 4s to 2s on 1.4.2")).toBe(true);
    expect(hasBareNumeral("ratio near 1, CI not excluding one")).toBe(true);
    expect(hasBareNumeral("22 affected users")).toBe(true);
  });

  it("does not treat an identifier-only string as a figure just because it contains digits", () => {
    expect(stripIdentifiers("KI-AD-007 and ble_disconnects_24h")).not.toMatch(/\d/);
  });
});

describe("finding references", () => {
  it("flags a reference to a finding that does not exist", () => {
    const output = makeInvestigation({
      summary: "Rate rose to {f_3}.",
      deterministic_findings: [
        {
          id: "f_1",
          label: "ble_disconnects_24h rate",
          value: 6.8,
          unit: "ratio",
          source: { kind: "tool_call", call_id: "call-1" },
        },
      ],
    });
    expect(orphanFindingRefs(output)).toEqual(["f_3"]);
  });

  it("renders a reference from the typed claim at display time", () => {
    expect(
      renderFindingRefs("rate rose to {f_1}", [
        { id: "f_1", value: 6.8, unit: "ratio" },
      ]),
    ).toBe("rate rose to 6.8 ratio");
  });
});

describe("claimDisciplineErrors", () => {
  it("names the field and leftover token, not a generic line", () => {
    const output = makeInvestigation({
      counter_evidence: [
        {
          claim:
            "All 100 firmware-1.4.2 devices in the current window are on app 3.2.",
          source: { kind: "tool_call", call_id: "call-1" },
        },
      ],
    });
    const errors = claimDisciplineErrors(output);
    expect(errors).toEqual(["counter_evidence[0].claim: bare numeral 100"]);
  });

  it("derives freeTextFields from freeTextEntries so the scored set cannot drift", () => {
    const output = makeInvestigation({
      counter_evidence: [
        {
          claim: "A documented mechanism in KD-06 matches the ticket text.",
          source: { kind: "tool_call", call_id: "call-1" },
        },
      ],
    });
    expect(freeTextFields(output)).toEqual(
      freeTextEntries(output).map((entry) => entry.text),
    );
    expect(freeTextEntries(output).some((e) => e.path === "counter_evidence[0].claim")).toBe(
      true,
    );
  });
});
