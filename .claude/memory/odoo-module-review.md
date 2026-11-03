# odoo19Module — backend review

Read-only review, 2026-10-26, done on the TEST box (13.60.79.10). Live (16.16.235.235) was checked read-only the same day and runs the same commit (`878fafa`, clean working tree) with the same barcode/quality modules installed (335 modules on live, 336 on test). No client data in this file.

## What it is

- The installed module is **`odoo19Module`** (version 19.0.0.5; XML IDs are `odoo19Module.*`). `customer_product_management` is only the manifest `name`.
- It replaces MAES's old Navision (NAV) system inside Odoo 19 Enterprise. Most of it is about field service requests: installation, maintenance and intervention visits.
- It is large: models about 33.5k lines (`project_task.py` 7,975 lines, `sale_order.py` 5,814), 953 commits.
- Sibling folders in `custom-addons/`: `field_service_routing` (Odoo addon: GPS and route optimisation) and `maes-security-web` (Next.js website, **not** an addon; it calls `/api/*`).

## Main business flows → models

| Flow | Key models |
| --- | --- |
| Field service requests (phases, work-order PDF, Mark as done → invoice) | `project.task`, `project.task.phase.product`, `project.task.product.install`, `fsm.big.project.line` |
| Installed products at customer sites (battery due, warranty, OK / Not OK) | `customer.product.line` (152,313 rows; 843 with `serial_number`, which is **free text, not `stock.lot`**), `customer.product.line.photo` |
| Sales orders gate procurement | `sale.order.inventory_action_state` (`no_action` / `ready_to_order` / `ordered`) |
| Contracts and subscriptions | `project.task.contract.line`, `contract.sign.log`, `nelectra.index` |
| Website buy requests and customer portal | `controllers/*_api.py` → `sale.order` |
| NAV migration | `customer.partner.worksheet*`, `customer.posted.workorder`, `res.partner.note.line`, `migration/`, `nav_migration_bundle/` |
| Van stock | `fsm.van.consumption.wizard`, `fsm.van.request.wizard`, `hr.employee.van_stock_location_id`; **off until 2027-01-01** (`odoo19Module.van_stock_active_from`) |
| Shelf/bin labels | `product.template.shelf_bin_location_id` / `shelf_bin_area_id`, `stock.move(.line).shelf_bin_label` |
| Documents per customer, Outlook sync, planning | `documents.document`, `outlook.import.job`, `calendar.event`, `fsm.expertise`, `gemini.planner` |

## Stock side (what the Barcode app runs into)

- The module defines **no stock models of its own**. It inherits `stock.picking` (`fsm_task_id`, van flags, stored `fsm_*` computes), `stock.move` / `stock.move.line` (`shelf_bin_label`), `stock.location`, `stock.warehouse.orderpoint`, `product.template` / `product.product` (whitespace-normalised `default_code`, NAV fields, `replaced_by_id`).
- **Warehouses:** 11 active. MAG is the central one, the others are van warehouses. All internal quants are on MAG.
- **Shelf locations:** 152, under the archived `WH/Stock`, with 0 quants and 0 barcodes. A shelf is a product label, not where stock actually sits.
- **Location barcodes:** only 12 locations have one.
- **Products:** 4,702 active on test / 4,738 on live. 872 / 874 have a `barcode`; nearly all have `default_code`. **6 `default_code` values are duplicated** among active products; there are no duplicate barcodes.
- **Barcode shapes:** mostly 12–13 digits, 135 alphanumeric; 39 barcodes equal the product's `default_code`.
- **Lots/serials:** 10 serial-tracked products on test, 18 on live (M2M SIM cards); 80 / 123 `stock.lot`. The Lots & Serial Numbers setting looks off for internal users, although serial products exist.
- **Overrides that run when Barcode validates a transfer:**
  - `stock.picking._action_done` / `action_cancel` (`models/fsm_material_light.py:108,113`) rebuild the material rows of linked installation requests under sudo.
  - `sale.order.line._action_launch_stock_rule` (`sale_order.py:5679`, `fsm_material_release_window.py:149`) creates no moves unless the order is ready_to_order/ordered and the material is released. **Most orders have no picking.**
  - Field service material only reaches `MAG/OUT` when a technician is responsible and the visit is within 14 days (daily cron, `odoo19Module.fsm_material_release_days`).
- **Mark as done can override the scans.** `project.task.action_fsm_validate` → `_settle_material_usage` (`project_task.py:7597`) re-validates open deliveries with the quantity the technician reports (`skip_backorder`, `skip_sanity_check`), makes returns or extra moves. Pickings that still need serials are left for the warehouse.
- **Hooks on every model:** four `_inherit = "base"` create/write hooks (worksheet sync files) run on every write, including the Barcode app's move-line writes.

## Access and security

- **App Access matrix** (`models/res_users_app_access.py`): one No / View / Modify / Admin field per app. Inventory View/Modify maps to `stock.group_stock_user`, Admin to `stock.group_stock_manager`. **Barcode, Quality and MRP have no entry of their own.**
- **Technicians cannot see Barcode.** `models/ir_ui_menu_technician.py` hides the Inventory, Quality and **Barcode** root menus for `group_fsm_tech` (9 users on test). Access rights stay; only the menus disappear. If technicians are to scan with the handheld, the backend must change this.
- **Record rules:** technicians see only their own open tasks. The `customer.product.line` rule for technicians is `[(1,'=',1)]`. There are no custom stock record rules.
- **Security findings** (reported, not fixed; backend team's call):
  - High — `GET /api/customers/<id>` is public, CORS-open, sudo and returns `security_system_password` for any id.
  - High — a 1.1 GB `odoo_db_backup.sql` sits in `/opt/odoo19/custom-addons/` on test.
  - Medium — `security_pwd_*` / `security_system_password` have no field `groups=`, so any internal user can read them over RPC.
  - Medium — the customer OTP has no attempt limit and uses `random`; the PIN check has no rate limit.
  - Never re-enable `field_service_routing/controllers/login.py`: it would log passwords.

## Rules from the backend's own CLAUDE.md

- The user does all git. Code reaches a box only through push, then `git pull` + `-u odoo19Module`.
- A change counts only when the code and data halves are done on **both** boxes, logged in `misc/LIVE_DEPLOY_MASTER.md`.
- Live-DB writes need an explicit go-ahead.
- UI labels in `i18n/nl_NL.po`.
- A newly installed module must be added to the App Access matrix.
- The client makes Studio changes (stored only in the DB), so check Studio views when a code change doesn't show.

## Open questions for the user / backend

1. Should technicians use the Barcode app? Then Barcode (and maybe Inventory) must come out of the technician hidden-menu list.
2. Should Lots & Serial Numbers be switched on before serials are scanned?
3. Should Barcode, Quality and MRP get App Access entries?
4. Should a scan ever resolve to installed products (`customer.product.line.serial_number`, free text)?
