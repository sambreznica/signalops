import { describe, expect, it } from "vitest";
import { hasBareNumeral } from "./numerals";

describe("EVAL-04b bare numerals", () => {
  it("allows firmware versions and document ids", () => {
    expect(hasBareNumeral("Firmware 1.4.2 appears in KD-02.")).toBe(false);
  });

  it("flags a bare count", () => {
    expect(hasBareNumeral("saw 12 disconnects overnight")).toBe(true);
  });
});
