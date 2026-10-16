/** Thin fetch wrapper: same-origin cookies, CSRF header on mutations, typed errors. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>, public details?: unknown) {
    super(message);
  }
}

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|; )aur_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

let csrfReady: Promise<void> | null = null;
async function ensureCsrf() {
  if (csrfToken()) return;
  csrfReady ??= fetch('/api/csrf', { credentials: 'include' }).then(() => undefined);
  await csrfReady;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown; query?: Record<string, unknown> } = {}): Promise<T> {
  const { json, query, ...rest } = init;
  const method = (rest.method ?? (json !== undefined ? 'POST' : 'GET')).toUpperCase();
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  if (method !== 'GET' && method !== 'HEAD') {
    await ensureCsrf();
    headers.set('X-CSRF-Token', csrfToken());
  }
  let url = `/api${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    const s = qs.toString();
    if (s) url += (url.includes('?') ? '&' : '?') + s;
  }
  const res = await fetch(url, { ...rest, method, headers, credentials: 'include', body: json !== undefined ? JSON.stringify(json) : rest.body });
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    const e = (body as { error?: { code?: string; message?: string; fields?: Record<string, string>; details?: unknown } }).error ?? {};
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? 'Something went wrong. Please try again.', e.fields, e.details);
  }
  return body as T;
}

export const get = <T,>(path: string, query?: Record<string, unknown>) => api<T>(path, { query });
export const post = <T,>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} });
export const put = <T,>(path: string, json?: unknown) => api<T>(path, { method: 'PUT', json: json ?? {} });
export const patch = <T,>(path: string, json?: unknown) => api<T>(path, { method: 'PATCH', json: json ?? {} });
export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE' });

export async function upload<T>(path: string, form: FormData): Promise<T> {
  await ensureCsrf();
  const res = await fetch(`/api${path}`, { method: 'POST', body: form, credentials: 'include', headers: { 'X-CSRF-Token': csrfToken() } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Upload failed');
  return body as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
