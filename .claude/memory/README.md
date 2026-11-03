# .claude/memory — shared project knowledge

Committed knowledge for everyone (and every Claude session) working on MaesApp. Claude Code does **not** load this folder automatically; `.claude/CLAUDE.md` points here, and Claude reads the relevant file when working in that area.

| File | What's in it |
| --- | --- |
| `decisions.md` | Decisions made (and still open) about libraries, auth, scope — append-only log |
| `odoo-backend.md` | Facts about the Odoo 19 backend the app talks to |
| `odoo-module-review.md` | Review of the custom `odoo19Module`: flows, stock overrides the Barcode app triggers, access, risks (2026-10-26) |
| `odoo-scan-modules.md` | How Odoo's barcode/scan modules parse and route a scan, MAES config/data, interaction with `odoo19Module`, gaps for the handheld flow (2026-10-26) |

Rules for this folder:

- One topic per file; date every fact that can go stale (`2026-10-21: …`).
- **No secrets and no client data** — no passwords, keys, tokens, customer names/addresses/serials. Server access details belong in your personal, gitignored `CLAUDE.local.md`.
- When a fact here turns out wrong, fix or delete it — don't append a contradiction.
- Claude's own per-user auto memory still lives in `~/.claude/projects/<project>/memory/` and is not shared; the `odoo-explorer` agent keeps its notes in `.claude/agent-memory-local/` (gitignored).
