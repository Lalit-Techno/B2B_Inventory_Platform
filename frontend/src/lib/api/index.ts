// Typed fetch wrapper. All API calls go through here (never ad-hoc fetch in components).
// Relative URLs only: Next.js rewrites /api/v1/* to the backend.

const BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export type Role =
  | "SUPER_ADMIN"
  | "ORG_ADMIN"
  | "INVENTORY_MANAGER"
  | "SALES_MANAGER"
  | "FINANCE_MANAGER"
  | "BUYER_USER";

export type AuthSession = {
  accessToken: string;
  expiresIn: number;
  role: Role;
  organizationId?: string;
  user: { id: string; email: string; fullName: string };
};

type SuccessBody<T> = { status: "success"; data: T; meta?: { nextCursor?: string | null } };
type ErrorBody = { status: "error"; error: { code: string; message: string; details?: unknown } };

// The access token lives in memory only; the refresh cookie (httpOnly) restores it after a reload.
let accessToken: string | undefined;
let onSessionLost: (() => void) | undefined;
let refreshing: Promise<AuthSession | null> | null = null;

export const setAccessToken = (token?: string) => {
  accessToken = token;
};
export const setSessionLostHandler = (fn?: () => void) => {
  onSessionLost = fn;
};

type Init = Omit<RequestInit, "body"> & { body?: unknown };

async function raw(path: string, init: Init): Promise<Response> {
  const { body, headers, ...rest } = init;
  try {
    return await fetch(`${BASE}${path}`, {
      credentials: "include",
      ...rest,
      headers: {
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("NETWORK", "Cannot reach the server", 0);
  }
}

async function parse<T>(res: Response): Promise<SuccessBody<T>> {
  const json = (await res.json().catch(() => null)) as SuccessBody<T> | ErrorBody | null;
  if (!res.ok || json?.status !== "success") {
    const err = json?.status === "error" ? json.error : undefined;
    throw new ApiError(err?.code ?? "INTERNAL", err?.message ?? "Request failed", res.status, err?.details);
  }
  return json;
}

/** Silent refresh. One call at a time: parallel callers share it (the refresh token rotates on every use). */
export function refreshSession(): Promise<AuthSession | null> {
  refreshing ??= (async () => {
    try {
      const s = (await parse<AuthSession>(await raw("/auth/refresh", { method: "POST" }))).data;
      accessToken = s.accessToken;
      return s;
    } catch {
      accessToken = undefined;
      return null;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

/** Sends the request; on 401 refreshes the session once and retries, else reports the session as lost. */
async function send(path: string, init: Init): Promise<Response> {
  const res = await raw(path, init);
  if (res.status !== 401 || path.startsWith("/auth/")) return res;
  if (await refreshSession()) return raw(path, init);
  onSessionLost?.();
  return res;
}

export async function api<T>(path: string, init: Init = {}): Promise<T> {
  return (await parse<T>(await send(path, init))).data;
}

/** Like api() for list endpoints: returns the rows and the cursor of the next page. */
export async function apiPage<T>(path: string): Promise<{ data: T[]; nextCursor: string | null }> {
  const body = await parse<T[]>(await send(path, {}));
  return { data: body.data, nextCursor: body.meta?.nextCursor ?? null };
}

/** Downloads a file (e.g. CSV) with the bearer token and saves it. */
export async function download(path: string, filename: string) {
  const res = await send(path, {});
  if (!res.ok) await parse(res); // throws the API error
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
