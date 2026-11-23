import { NextResponse } from "next/server";
import { chatLanguage, readChatPayload, type ChatLanguage, type GeoPoint } from "@/lib/ai";
import { allowChat, visitorIp } from "@/lib/chat-limit";
import { mendyRequest } from "@/lib/mendy-api";

const LANGUAGES = new Set<ChatLanguage>(["en", "ha", "yo", "ig", "pcm"]);
const MAX_MESSAGE = 2000;
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "https://mendy.indurahealth.com",
]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders(request) });
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

function geoPoint(value: unknown): GeoPoint | undefined {
  if (!value || typeof value !== "object") return undefined;
  const point = value as { latitude?: unknown; longitude?: unknown };
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  return { latitude, longitude };
}

function languageOf(value: unknown, message: string): ChatLanguage {
  return typeof value === "string" && LANGUAGES.has(value as ChatLanguage) ? (value as ChatLanguage) : chatLanguage(message);
}

function errorCode(payload: unknown) {
  if (!payload || typeof payload !== "object") return "upstream_error";
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code || "");
    if (code === "MENDY_WEB_NOT_CONFIGURED") return "not_configured";
    return code || "upstream_error";
  }
  return "upstream_error";
}

export async function POST(request: Request) {
  if (!allowChat(visitorIp(request))) {
    return json(request, { error: "rate_limited" }, 429);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "invalid_json" }, 400);
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (!message) {
    return json(request, { error: "message_required" }, 400);
  }
  if (message.length > MAX_MESSAGE) {
    return json(request, { error: "message_too_long" }, 400);
  }
  const secret = process.env.MENDY_WEB_SHARED_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    return json(request, { error: "not_configured" }, 503);
  }
  const location = geoPoint(record.location);
  const upstream = await mendyRequest("/ai/chat/web", {
    method: "POST",
    headers: { "X-Mendy-Web-Secret": secret },
    body: {
      message,
      language: languageOf(record.language, message),
      ...(location ? { location } : {}),
    },
  });
  if (upstream.status < 200 || upstream.status >= 300) {
    const status = upstream.status === 429 ? 429 : upstream.status >= 400 ? upstream.status : 502;
    return json(request, { error: errorCode(upstream.payload) }, status);
  }
  const chat = readChatPayload(upstream.payload, message);
  if (!chat.reply) {
    return json(request, { error: "unexpected_response" }, 502);
  }
  return json(request, { reply: chat.reply });
}
