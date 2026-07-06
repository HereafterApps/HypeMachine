const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
// Server-only: these fetchers run in server components / server actions.
// The token must NEVER be exposed via a NEXT_PUBLIC_ variable — those are
// inlined into the client bundle.
const API_TOKEN = process.env.API_TOKEN;

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    headers: API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {},
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
