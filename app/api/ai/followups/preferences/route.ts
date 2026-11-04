import { NextResponse } from "next/server";
import { mendyRequest } from "@/lib/mendy-api";

export async function GET() {
  const upstream = await mendyRequest("/ai/followups/preferences", { method: "GET" });
  return NextResponse.json(upstream.payload ?? {}, { status: upstream.status });
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const enabled = body && typeof body === "object" ? (body as { enabled?: unknown }).enabled : undefined;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled_required" }, { status: 400 });
  }
  const upstream = await mendyRequest("/ai/followups/preferences", {
    method: "PUT",
    body: { enabled },
  });
  return NextResponse.json(upstream.payload ?? {}, { status: upstream.status });
}
