---
name: odoo-api-contract
description: Specify an Odoo call or new backend endpoint that MaesApp needs, as a contract document the backend (odoo19Module) work can implement. Use when a screen needs Odoo data or an action and it is unclear whether Odoo's standard JSON-2 API already covers it.
argument-hint: "<what the app needs, e.g. 'product lookup by scanned code'>"
---

Need: **$ARGUMENTS**

1. **Facts first.** Delegate to the `odoo-explorer` agent: which model(s) and fields hold this data, which access groups can read/write them, and whether existing backend code already does something similar. Don't guess field names.
2. **Standard JSON-2 or custom endpoint?**
   - JSON-2 (`POST /json/2/<model>/<method>`, the user's API key, runs with that user's access rights) is enough for a single `search_read` / `read` / existing `action_*` call. Prefer it — no backend change needed.
   - A custom controller is needed when several writes must be atomic (each JSON-2 call is its own transaction), when logic must run server-side in one round-trip (e.g. barcode → `default_code` fallback), when the app needs a shape no model method returns, or for login / API-key issuance.
3. **Write the contract** to `docs/odoo-api/<kebab-name>.md` with these sections:
   - **Purpose** — which screen uses it and why.
   - **Call** — JSON-2 model + method + named arguments, or the custom route: path (e.g. `/maesapp/...`), `type='jsonrpc'` or `'http'`, `auth='bearer'`, HTTP method. Never `auth='public'`; no `sudo()` unless justified against record rules.
   - **Request / response** — JSON with types, including `false` for empty values, many2one `[id, name]` and UTC datetimes. Examples use **synthetic data only**.
   - **Odoo mapping** — `model.field` for every response field.
   - **Access** — which groups may call it and what others get (403).
   - **Errors** — each error case and how the app reacts.
   - **Performance** — `fields`, `limit`, pagination, any index needed.
   - **Labels** — any server-side user-facing text needs an `i18n/nl_NL.po` entry.
   - **Test plan on 13.60** — `curl` examples using a placeholder `$MAESAPP_TEST_API_KEY`, never a real key.
   - **Rollout** — per the backend repo's rules: the user pushes; `-u odoo19Module` on BOTH boxes; logged in `misc/LIVE_DEPLOY_MASTER.md`; live only after the test box is verified.
4. **Record** a one-line pointer in `.claude/memory/odoo-backend.md` under "App endpoints (planned/live)".
5. **Report** a short summary and the doc path. Say explicitly that implementation happens in the backend repo under its own `CLAUDE.md` rules — don't edit anything on the server from this repo.
