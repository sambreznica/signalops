import { describe, expect, it } from "vitest";
import {
  INVESTIGATOR_EFFORT,
  investigatorOutputConfig,
} from "./sampling";

describe("investigator sampling", () => {
  it("sets effort explicitly and does not send a sampling parameter", () => {
    expect(INVESTIGATOR_EFFORT).toBe("medium");
    const body = {
      max_tokens: 8192,
      output_config: investigatorOutputConfig(),
    };
    expect(JSON.stringify(body)).not.toMatch(/temperature|top_p|top_k/);
    expect(body.output_config.effort).toBe("medium");
  });
});
