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
  console.info(`[mendy] MENDY_API_BASE_URL configured=${Boolean(base)}`);
  if (!base) {
    console.error(`[mendy] upstream request was not sent; ${init.method} ${path}`);
    return { status: 503, payload: { error: "not_configured" } as unknown };
  }
  const url = mendyUrl(path);
  console.info(`[mendy] upstream URL ${url}`);
  try {
    const response = await fetch(url, {
      method: init.method,
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const line = `[mendy] upstream ${response.ok ? "succeeded" : "failed"} status=${response.status} ${init.method} ${url}`;
    if (response.ok) console.info(line);
    else console.error(line);
    const text = await response.text();
    if (!text) return { status: response.status, payload: {} as unknown };
    try {
      return { status: response.status, payload: JSON.parse(text) as unknown };
    } catch {
      console.error(`[mendy] ${init.method} ${url} returned a non-JSON body`);
      return {
        status: response.status,
        payload: { error: "upstream_error" } as unknown,
      };
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    console.error(`[mendy] upstream network error ${init.method} ${url}: ${reason}`);
    return { status: 502, payload: { error: "upstream_unreachable" } as unknown };
  }
}
