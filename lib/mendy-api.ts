import { connection } from "next/server";

export function mendyBaseUrl() {
  return process.env.MENDY_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";
}

export async function mendyRequest(path: string, init: { method: string; body?: unknown }) {
  await connection();
  const base = mendyBaseUrl();
  if (!base) {
    return { status: 503, payload: { error: "not_configured" } as unknown };
  }
  try {
    const response = await fetch(base + path, {
      method: init.method,
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
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
        payload: { error: "upstream_error", message: text.slice(0, 500) } as unknown,
      };
    }
  } catch {
    return { status: 502, payload: { error: "upstream_unreachable" } as unknown };
  }
}
