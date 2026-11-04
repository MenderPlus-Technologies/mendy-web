import { NextResponse } from "next/server";
import { readChatPayload, type GeoPoint } from "@/lib/ai";
import { mendyRequest } from "@/lib/mendy-api";

function geoPoint(value: unknown): GeoPoint | undefined {
  if (!value || typeof value !== "object") return undefined;
  const point = value as { latitude?: unknown; longitude?: unknown };
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  return { latitude, longitude };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message_required" }, { status: 400 });
  }
  const language = record.language === "ha" ? "ha" : "en";
  const location = geoPoint(record.location);
  const upstream = await mendyRequest("/ai/chat/user", {
    method: "POST",
    body: {
      message,
      language,
      ...(location ? { location } : {}),
    },
  });
  if (upstream.status < 200 || upstream.status >= 300) {
    const payload = upstream.payload && typeof upstream.payload === "object" ? upstream.payload : { error: "upstream_error" };
    return NextResponse.json(payload, { status: upstream.status });
  }
  const chat = readChatPayload(upstream.payload, message);
  if (!chat.reply) {
    return NextResponse.json({ error: "unexpected_response", conversationId: chat.conversationId || undefined }, { status: 502 });
  }
  return NextResponse.json({
    reply: chat.reply,
    ...(chat.conversationId ? { conversationId: chat.conversationId } : {}),
  });
}
