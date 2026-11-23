import { connection } from "next/server";

export function mendyBaseUrl() {
  return process.env.MENDY_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";
}

function mendyUrl(path: string) {
  const base = mendyBaseUrl();
  const host = base.endsWith("/api") ? base.slice(0, -"/api".length) : base;
  const route = path.startsWith("/") ? path : `/${path}`;
  return host + "/api" + route;
}

export async function mendyRequest(
  path: string,
  init: { method: string; body?: unknown; headers?: Record<string, string> },
) {
  await connection();
  const base = mendyBaseUrl();
  if (!base) {
    return { status: 503, payload: { error: "not_configured" } as unknown };
  }
  try {
    const response = await fetch(mendyUrl(path), {
      method: init.method,
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const text = await response.text();
    if (!text) return { status: response.status, payload: {} as unknown };
    try {
      return { status: response.status, payload: JSON.parse(text) as unknown };
    } catch {
      return {
        status: response.status,
        payload: { error: "upstream_error" } as unknown,
      };
    }
  } catch {
    return { status: 502, payload: { error: "upstream_unreachable" } as unknown };
  }
}
