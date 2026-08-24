import { describe, expect, it } from "vitest";
import { computeSeverity } from "./severity";

describe("computeSeverity", () => {
  it("scores a large FUNCTIONAL event as HIGH when the prior is ample", () => {
    const result = computeSeverity({
      affected_users: 100,
      fleet_size: 400,
      rate_window: 10.53,
      rate_prior: 1.54,
      prior_events: 1800,
      trend: "rising",
      consequence_class: "FUNCTIONAL",
    });
    expect(result.affected_factor).toBe(1);
    expect(result.ratio).toBeCloseTo(10.53 / 1.54);
    expect(result.delta_factor).toBe(1);
    expect(result.delta_factor_floored).toBe(false);
    expect(result.severity_index).toBe(1);
    expect(result.band).toBe("HIGH");
  });

  it("reports the true ratio and caps delta_factor when the prior is thin", () => {
    const result = computeSeverity({
      affected_users: 20,
      fleet_size: 400,
      rate_window: 0.0175,
      rate_prior: 0.0017,
      prior_events: 2,
      trend: "rising",
      consequence_class: "REGULATORY",
    });
    expect(result.ratio).toBeCloseTo(0.0175 / 0.0017);
    expect(result.delta_factor).toBe(0.2);
    expect(result.delta_factor_floored).toBe(true);
    expect(result.band).toBe("MEDIUM");
    expect(result.severity_index).toBeCloseTo(0.45);
  });

  it("returns a null ratio when the prior rate is zero", () => {
    const result = computeSeverity({
      affected_users: 10,
      fleet_size: 400,
      rate_window: 1,
      rate_prior: 0,
      prior_events: 0,
      trend: "rising",
      consequence_class: "FUNCTIONAL",
    });
    expect(result.ratio).toBeNull();
    expect(result.delta_factor).toBe(0);
    expect(result.delta_factor_floored).toBe(true);
  });

  it("keeps a flat FUNCTIONAL cluster LOW", () => {
    const result = computeSeverity({
      affected_users: 38,
      fleet_size: 400,
      rate_window: 1.0,
      rate_prior: 1.0,
      prior_events: 400,
      trend: "flat",
      consequence_class: "FUNCTIONAL",
    });
    expect(result.delta_factor).toBe(0.2);
    expect(result.delta_factor_floored).toBe(false);
    expect(result.band).toBe("LOW");
  });
});
