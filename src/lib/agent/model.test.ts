import { afterEach, describe, expect, it } from "vitest";
import { requireAnthropicModel } from "./model";

describe("requireAnthropicModel", () => {
  const previous = process.env.ANTHROPIC_MODEL;

  afterEach(() => {
    if (previous === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = previous;
  });

  it("throws naming ANTHROPIC_MODEL when unset", () => {
    delete process.env.ANTHROPIC_MODEL;
    expect(() => requireAnthropicModel()).toThrow(/ANTHROPIC_MODEL/);
  });

  it("throws when empty", () => {
    process.env.ANTHROPIC_MODEL = "  ";
    expect(() => requireAnthropicModel()).toThrow(/ANTHROPIC_MODEL/);
  });
});
