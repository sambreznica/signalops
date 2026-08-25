import type { InvestigationOutput } from "../src/lib/schema/investigation";

const TARGET = "1.4.2";

function argString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** True when a tool call actually queried or compared this firmware version. */
export function firmwarePinnedInTrace(
  output: InvestigationOutput,
  version: string = TARGET,
): boolean {
  for (const event of output.trace) {
    if (event.kind !== "tool_call") continue;
    const args = event.arguments;
    if (event.tool === "query_telemetry" && argString(args.firmware_version) === version) {
      return true;
    }
    if (event.tool === "compare_versions" && args.axis === "firmware_version") {
      if (argString(args.version_a) === version) return true;
      if (argString(args.version_b) === version) return true;
    }
  }
  return false;
}

/** True when a typed finding label names this firmware version. */
export function firmwareNamedInFindings(
  output: InvestigationOutput,
  version: string = TARGET,
): boolean {
  return output.deterministic_findings.some((row) => row.label.includes(version));
}

export function firmwareIdentified(output: InvestigationOutput): {
  in_trace: boolean;
  in_findings: boolean;
} {
  return {
    in_trace: firmwarePinnedInTrace(output),
    in_findings: firmwareNamedInFindings(output),
  };
}
