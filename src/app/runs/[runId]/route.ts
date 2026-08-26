import { existsSync, readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { runFilePath } from "@/lib/replay/load";

const RUN_ID_RE = /^run-[A-Za-z0-9._-]+$/;

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  if (!RUN_ID_RE.test(runId)) {
    return NextResponse.json({ error: "invalid run id" }, { status: 400 });
  }
  const file = runFilePath(runId);
  if (!existsSync(file)) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  const body = readFileSync(file, "utf8");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `inline; filename="${runId}.json"`,
    },
  });
}
