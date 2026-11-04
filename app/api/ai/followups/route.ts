import { NextResponse } from "next/server";
import { mendyRequest } from "@/lib/mendy-api";

export async function GET(request: Request) {
  const language = new URL(request.url).searchParams.get("language") === "ha" ? "ha" : "en";
  const upstream = await mendyRequest("/ai/followups?language=" + language, { method: "GET" });
  return NextResponse.json(upstream.payload ?? {}, { status: upstream.status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const conversationId = typeof record.conversationId === "string" ? record.conversationId.trim() : "";
  const type = typeof record.type === "string" ? record.type.trim() : "";
  if (!conversationId || !type) {
    return NextResponse.json({ error: "conversation_required" }, { status: 400 });
  }
  const upstream = await mendyRequest("/ai/followups", {
    method: "POST",
    body: { conversationId, type },
  });
  return NextResponse.json(upstream.payload ?? {}, { status: upstream.status });
}
