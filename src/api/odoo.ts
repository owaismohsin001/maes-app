import { ODOO_ORIGIN } from '../config';

/**
 * The app's one way to call Odoo from native screens.
 *
 * Decided 2026-10-26 (see `.claude/memory/decisions.md`): native screens use
 * the session the user opened in the WebView. On Android React Native's
 * networking stores cookies in the same `CookieManager` as the WebView, so a
 * `fetch` to the Odoo origin carries the session cookie. The calls are the
 * web client's own JSON-RPC routes — exactly what Odoo's Barcode app calls —
 * so the user has the same rights here as there.
 */

export type OdooErrorKind =
  /** Not signed in (any more): sign in again in the WebView. */
  | 'session'
  /** No connection / DNS / TLS failure. */
  | 'network'
  | 'timeout'
  /** The user may not do this (AccessError). */
  | 'access'
  /** Odoo refused with a message for the user (UserError, ValidationError). */
  | 'user'
  /** Anything else: a bug or server trouble. */
  | 'server';

export class OdooError extends Error {
  kind: OdooErrorKind;
  constructor(kind: OdooErrorKind, message: string) {
    super(message);
    this.name = 'OdooError';
    this.kind = kind;
  }
}

export const DEFAULT_TIMEOUT_MS = 20000;

type RpcError = {
  code?: number;
  message?: string;
  data?: { name?: string; message?: string };
};

type RpcResponse<T> = { result?: T; error?: RpcError };

let nextId = 1;

function errorFrom(error: RpcError): OdooError {
  const name = error.data?.name ?? '';
  const message = error.data?.message || error.message || 'Odoo error';
  if (name.endsWith('SessionExpiredException') || error.code === 100) {
    return new OdooError('session', message);
  }
  if (name.endsWith('AccessError') || name.endsWith('AccessDenied')) {
    return new OdooError('access', message);
  }
  if (
    name.endsWith('UserError') ||
    name.endsWith('ValidationError') ||
    name.endsWith('RedirectWarning') ||
    name.endsWith('MissingError')
  ) {
    return new OdooError('user', message);
  }
  return new OdooError('server', message);
}

/** POST a JSON-RPC call to an Odoo route (`type='jsonrpc'`). */
export async function jsonRpc<T>(
  route: string,
  params: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${ODOO_ORIGIN}${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        id: nextId++,
        params,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    throw timedOut
      ? new OdooError('timeout', 'timeout')
      : new OdooError('network', e instanceof Error ? e.message : 'network');
  }
  if (response.status === 401 || response.status === 403) {
    clearTimeout(timer);
    throw new OdooError('session', `HTTP ${response.status}`);
  }
  // The timeout covers the body too: a stalled answer must not load forever.
  let body: RpcResponse<T>;
  try {
    body = (await response.json()) as RpcResponse<T>;
  } catch {
    if (timedOut) {
      throw new OdooError('timeout', 'timeout');
    }
    // A login page or proxy error instead of JSON.
    throw new OdooError(
      response.ok ? 'session' : 'server',
      `HTTP ${response.status}`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (body.error) {
    throw errorFrom(body.error);
  }
  return body.result as T;
}

/** Calls a model method like the web client does (`/web/dataset/call_kw`). */
export function callKw<T>(
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
  timeoutMs?: number,
): Promise<T> {
  return jsonRpc<T>(
    `/web/dataset/call_kw/${model}/${method}`,
    { model, method, args, kwargs },
    timeoutMs,
  );
}

/** Odoo's `false` for an empty value → null. */
export function orNull<T>(value: T | false | null | undefined): T | null {
  return value === false || value === undefined ? null : value;
}

/** A many2one read with `load=False` (id) or via search_read ([id, name]). */
export type Many2one = number | [number, string] | false;

export function m2oId(value: Many2one | undefined): number | null {
  if (Array.isArray(value)) {
    return value[0];
  }
  return typeof value === 'number' ? value : null;
}

export function m2oName(value: Many2one | undefined): string | null {
  return Array.isArray(value) ? value[1] : null;
}

/** Odoo's naive UTC datetime string ("YYYY-MM-DD HH:MM:SS") → Date. */
export function parseOdooDate(value: string | false | undefined): Date | null {
  if (!value) {
    return null;
  }
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Path of a record's form in the web client, e.g. `/odoo/stock.picking/7`. */
export function odooRecordPath(model: string, id: number): string {
  return `/odoo/${model}/${id}`;
}
