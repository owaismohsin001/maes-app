# Odoo backend facts

Surveyed read-only on 2026-10-21 unless dated otherwise. Re-verify with the `odoo-explorer` agent before relying on counts.

## Boxes

| Box | Role | Use from the app? |
| --- | --- | --- |
| `13.60.79.10` — `https://testing.maes-security.com` | Client TEST box | Yes — all development and testing |
| `16.16.235.235` | **LIVE production** (since 2026-10-05; client team works on it all day) | Only a release build, with explicit go-ahead |

Both run Odoo 19.0+e Enterprise, DB `odoo_db`, port 8069 behind nginx. Both DBs are periodically re-synced from each other, so test data looks like real data — treat it as client data (never copy it into the repo). The client also works on the test box as `admin`; never assume it is idle.

## Backend code

- Custom modules in `/opt/odoo19/custom-addons/`: `odoo19Module` (main), `field_service_routing`, and `maes-security-web` (the public Next.js website). Full review: `odoo-module-review.md` (2026-10-26).
- `odoo19Module` has its own `CLAUDE.md` and rules: the user does all git; a change counts only when code (`git pull` + `-u odoo19Module`) **and** any data half are done on BOTH boxes; Dutch UI labels go in `i18n/nl_NL.po`; every completed point is logged in `misc/LIVE_DEPLOY_MASTER.md`; a newly installed Odoo app must be added to the "App Access" matrix. New endpoints for this app therefore go through that repo's workflow — write the request with `/odoo-api-contract`.

## Existing HTTP controllers (`odoo19Module/controllers/`)

`auth_api.py` (customer email-OTP), `customer_api.py`, `product_api.py`, `buy_request_api.py`, `contract_sign.py`, `security_pin_controller.py`, plus Outlook/calendar helpers.
These serve the public website and customer portal, **not staff**. Do not reuse them for MaesApp:
`/api/customers/<id>` is `auth='public'` + `sudo()` and returns `security_system_password` — reported to the user as a security hole.

## Data shape relevant to scanning

- Products: 4,702; only 872 have `barcode`; nearly all have `default_code` (internal reference). → Barcode lookup must fall back to `default_code` and manual search. 2026-10-26: Odoo's Barcode app never searches `default_code` (3,816 products are reachable only by it); details in `odoo-scan-modules.md`.
- Installed products at customer sites (`customer.product.line`): ~150,745 rows, only 843 with a serial number.
- Documents (`documents` app): ~7,739.
- Internal users: 18.
- Relevant installed modules: `stock_barcode`, `quality_control`, `industry_fsm` (Field Service), `documents`, `sign`.

## Odoo 19 external API — what it means for app auth

Researched 2026-10-21 from the [External JSON-2 API docs](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html) and the 19.0 source (`addons/rpc/controllers/json2.py`, `ir_http._auth_method_bearer`). Not yet tested against our server.

- JSON-2: `POST /json/2/<model>/<method>`, `Authorization: bearer <api_key>`, named arguments only; each call is one transaction. Ships in the auto-installed `rpc` addon.
- `/jsonrpc` and `/xmlrpc` are deprecated (removal in Odoo 22). Custom `@http.route(type='jsonrpc')` controllers are not affected.
- `/json/2` and `auth='bearer'` routes reject a session cookie unless the request has browser navigation headers → a mobile app must send an **API key**.
- `/web/session/authenticate` returns `uid: None` for users with 2FA enabled.
- API keys: created by the user under Preferences ‣ Account Security; for internal users the maximum lifetime is 90 days (`api_key_duration` per group); max 10 keys per user; `revoke()` exists. Generating keys programmatically is admin-only unless `base.enable_programmatic_api_keys` is set.
- Candidate design (needs the user's decision and a backend change): a custom login route verifies login + password (+ TOTP if enabled) and issues a per-user, per-device key (`res.users.apikeys` `_generate('rpc', 'MaesApp <device>', expiry)`); the app stores it in the secure store and revokes it on logout. No shared/bot key in the APK — it can be extracted.

## App endpoints (planned/live)

None yet. Add one line per contract written with `/odoo-api-contract`: `name — docs/odoo-api/<file>.md — status (draft / on 13.60 / on both boxes)`.

## Purchase → receipt flow (read-only check on TEST, 2026-10-27)

- `odoo19Module` does not change the purchase workflow (only §P297 supplier-code cosmetics on `purchase.order.line`). Confirming an RFQ creates one `MAG/IN/xxxxx` receipt (Vendors → MAG/Stock) the standard way; every warehouse is `one_step`, and only MAG's "Receipts" operation type (id 41) is active.
- Confirming a sale order never buys. POs come from the sale side: "Ready to Order" (button, §P309 phase cron, §P314 manual release) → `_reserve_and_purchase_shortfall` reserves MAG stock and buys the rest via the Buy route (`origin` = SO name) or the product's auto reordering rule (432 auto orderpoints at MAG; scheduler cron daily 07:45 UTC). One open draft RFQ per vendor absorbs every need (`group_rfq='all'`).
- Receipt validation from the Barcode app = `button_validate` with `skip_backorder`: standard effects only (quants at MAG/Stock, `purchase.order.line.qty_received`, PO `receipt_status`, `acknowledged`). No module hook reacts to a vendor receipt (the `_action_done` hooks key on `sale_id` / customer source): no task/technician notification, no `inventory_action_state` change; the linked delivery becomes available at the next reservation and the §P313 30-min cron picks that up. `fsm_task_id` is never set on incoming pickings.
- Incoming receipt lines arrive pre-filled (`quantity` > 0, `picked` false); the app counts `qty_done` only once `picked`, like Odoo's barcode model.
- Data on test: 71 POs (31 draft, 40 confirmed); 50 incoming pickings (33 ready, 9 done, 7 cancelled, 1 draft); 30 of the ready ones carry NAV `IO..` origins. All 9 done receipts were validated by scripts (uid 1), none by a user or the Barcode app yet. Details: `.claude/agent-memory-local/odoo-explorer/backend_map_purchase_receipts.md`.
- 2026-10-27 (§P369, test box only until pushed): the **purchase order PDF prints the PO number as a Code128** (`odoo19Module.purchaseorder_barcode`). Odoo 19 itself prints a barcode only on the Picking Operations report (picking name, Code128), not on the Delivery Slip or any purchase PDF. Receipts' `origin` equals the PO name exactly (39/39), which is what the app's `findPickingsByOrigin` relies on. `stock.picking.purchase_id` is not a stored column in 19; the link is `stock.move.purchase_line_id`.

## Sale order → delivery gate (read-only check on TEST, 2026-10-30)

- Confirming a sale order creates **no delivery**. `odoo19Module` overrides `_action_launch_stock_rule` (`models/sale_order.py` ~5759): stock moves are made only once the order's `inventory_action_state` is `ready_to_order` or `ordered` (button "Ready to Order"), plus material added from a field-service task. Default is `no_action`; on test 6,814 confirmed orders are `no_action`, 84 `ready_to_order`, 6 `ordered`.
- The "Ready to Order" button is hidden on subscription orders (`views/sale_order_views.xml` ~69), so goods lines on maintenance subscriptions (`SUB-MAINTENANCE`) never get a delivery. Open question for the client/backend.
- For the app: an empty `findPickingsByOrigin` result for a confirmed SO usually means "not released yet", not a broken search. The order ↔ picking link in 19 is `stock_picking.sale_id` / `stock_move.sale_line_id` (no `procurement_group_id` on `sale_order`).
- One order can have several deliveries (checked on S47090, 2026-10-30): a goods line added to a released (`ready_to_order`/`ordered`), non-subscription order gets its **own new delivery** (`SaleOrder.write` ~2600 sets `maes_defer_line_procurement`, then `_create_delivery_manually` + `_create_purchase_for_shortfall`), often `confirmed` (waiting for stock) and so hidden by the app's "Ready" filter. A qty increase on an existing line goes through standard stock rules and shows up as an **extra move** on the existing delivery (1 + 3), not an edit of the first move; the app's `productRows` already sums moves per product.
- Deleting a move from a delivery (checked on S47090, 2026-10-30) changes **only the delivery**: the sale order line keeps its qty (ordered 2 / delivered 0) and the shortfall PO line stays. Neither core nor `odoo19Module` syncs a move deletion back (no `unlink`/`_action_cancel` override on `stock.move`). The emptied delivery drops to `draft` with no moves and still matches the app's origin search. Removing a product properly = on the order line: deleting it is allowed only before "Ready to Order" (and with nothing delivered/invoiced) — `_check_line_unlink` raises "Set the quantity to 0 instead" after it — so set the qty to 0, then remove the draft PO line by hand.
