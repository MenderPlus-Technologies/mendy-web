import { NextResponse } from "next/server";
import type { GeoPoint } from "@/lib/ai";
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const followupId = id.trim();
  if (!followupId) {
    return NextResponse.json({ error: "followup_required" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const button = typeof record.button === "string" ? record.button.trim() : "";
  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (!button && !message) {
    return NextResponse.json({ error: "reply_required" }, { status: 400 });
  }
  const language = record.language === "ha" ? "ha" : "en";
  const location = geoPoint(record.location);
  const upstream = await mendyRequest("/ai/followups/" + encodeURIComponent(followupId) + "/reply", {
    method: "POST",
    body: {
      ...(button ? { button } : {}),
      ...(message ? { message } : {}),
      language,
      ...(location ? { location } : {}),
    },
  });
  return NextResponse.json(upstream.payload ?? {}, { status: upstream.status });
}
