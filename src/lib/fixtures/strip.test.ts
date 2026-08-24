import { describe, expect, it } from "vitest";
import { GROUND_TRUTH_KEYS, strip } from "./strip";

describe("strip", () => {
  it("removes every ground-truth key from a record", () => {
    const leaked = {
      id: "FB-0001",
      text: "The patch dropped the connection.",
      ground_truth_cluster: "SIG-001",
      is_real: true,
      authorial_severity: "HIGH",
      claims_risk: false,
      signal_id: "SIG-001",
      expected_severity: "HIGH",
      expected_band: "HIGH",
      feedback_ids: ["FB-0001"],
      device_ids: ["KL-0001"],
      ground_truth: "secret",
    };

    const stripped = strip(leaked);
    for (const key of GROUND_TRUTH_KEYS) {
      expect(stripped).not.toHaveProperty(key);
    }
    expect(stripped).toEqual({
      id: "FB-0001",
      text: "The patch dropped the connection.",
    });
  });
});
