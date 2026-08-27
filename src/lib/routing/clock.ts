export type BoardClockMode = "live" | "replay";

export function boardNow(args: {
  mode: BoardClockMode;
  runTimestamp: string;
  wall?: Date;
}): Date {
  if (args.mode === "replay") {
    const frozen = new Date(args.runTimestamp);
    if (Number.isNaN(frozen.getTime())) {
      throw new Error(`invalid run timestamp: ${args.runTimestamp}`);
    }
    return frozen;
  }
  return args.wall ?? new Date();
}
