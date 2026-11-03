---
paths:
  - "src/api/**"
  - "docs/odoo-api/**"
---

# Talking to Odoo 19

> **Exception, decided 2026-10-26:** the native Barcode screens (`src/api/barcode.ts`) use the WebView's session cookie and Odoo's own web-client routes (`/stock_barcode/*`, `/web/dataset/call_kw`) through `src/api/odoo.ts` — the same calls Odoo's Barcode app makes. Keep that client the only place doing it, and re-check the shapes against `stock_barcode` after any Odoo upgrade. The JSON-2 / API-key rules below still apply to anything else.

- One client in `src/api/` owns the base URL, auth header, timeouts and error mapping. Screens call typed functions/hooks from it — never raw `fetch`.
- Base URL comes from build config: the TEST box `https://testing.maes-security.com` for dev/debug. The live URL may only appear in an explicit release config — never as a fallback default.
- Use Odoo 19's **JSON-2 API**: `POST /json/2/<model>/<method>` with headers `Authorization: bearer <api_key>` and `Content-Type: application/json`. The body holds **named arguments only** (e.g. `{"domain": [...], "fields": [...], "limit": 50, "context": {"lang": "..."}}`) plus `ids` for record methods. Errors come back as 4xx/5xx with `{name, message, arguments, context, debug}`. Each call is its own transaction — a multi-step write must be one server-side method.
- Don't build on `/jsonrpc` or `/xmlrpc` (deprecated, removed in Odoo 22) or on `/web/dataset/call_kw` (internal web-client endpoint). Never call the public website controllers (`/api/customers`, `/api/products`, customer OTP).
- JSON-2 rejects session cookies from non-browser clients, so the app authenticates with a **per-user API key**. The login flow is still an open decision (`.claude/memory/decisions.md`, `.claude/memory/odoo-backend.md`) — don't invent one without the user. Never ship a shared or bot API key inside the app.
- The key lives only in the secure store. Internal users' keys expire (≤ 90 days): a 401 sends the user back to login; don't retry-loop.
- Always pass `fields` and a `limit` to `search_read` (some tables have 150k+ rows). Paginate lists with `offset`/`limit`.
- Odoo value quirks — normalise them at the API boundary so screens get clean types:
  - Empty char/text/date/many2one fields come back as `false`, not `null` → type them `string | false` in the raw type and map to `null`.
  - many2one fields come back as `[id, display_name]`.
  - Datetimes are naive UTC strings `"YYYY-MM-DD HH:MM:SS"` → parse as UTC, display in the user's timezone (Belgium: `Europe/Brussels`).
  - Pass the user's `lang` in `context` to get translated names.
- Product lookup by scanned code: `barcode` → `default_code` → manual search (see `.claude/rules/scanner.md`).
- Network on site is poor: set a timeout on every request, retry only idempotent reads, and show an offline state instead of spinning forever.
- Odoo has no suitable method/endpoint for what a screen needs? Write a contract with `/odoo-api-contract`; don't change the backend from this repo.
