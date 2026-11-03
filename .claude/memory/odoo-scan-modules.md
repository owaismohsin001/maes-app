# Odoo 19 scan modules — how they work with MAES

Read-only study, 2026-10-26, done on the TEST box. Live config was checked the same day and matches: same modules, same nomenclature, same operation-type options, same location barcodes. No client data in this file. Core code is in `/usr/lib/python3/dist-packages/odoo/addons/`.

## Installed

- **In use:** `barcodes`, `barcodes_gs1_nomenclature` (installed, but the GS1 nomenclature is **not** selected), `stock_barcode`, `stock_barcode_picking_batch`, `stock_picking_batch`.
- **Installed but doing nothing today:**
  - `stock_barcode_mrp`, `mrp_workorder` — 0 manufacturing orders.
  - `stock_barcode_quality_control(_picking_batch)`, `stock_barcode_quality_mrp`, `quality_control` — 0 quality points.
  - `product_barcodelookup` — no API key set.
- **Not installed:** `stock_barcode_product_expiry`, `stock_barcode_barcodelookup`, `stock_barcode_mrp_subcontracting`.

## Parsing (`barcodes`)

- **Company nomenclature:** "Default Nomenclature" (id 1, 9 rules).
  - Aliases: `WH-RECEIPTS`, `O-BTN.validate`→`OBTVALI`, `O-BTN.pack`→`OBTPACK`, `WH-STOCK`.
  - Type rules: weight `21.....{NNDDD}`, location `414`, package `PACK`, lot `10`.
  - Catch-all: product `.*` with encoding `any`, so **no UPC↔EAN conversion**. The handheld must send exactly the stored string (421 barcodes have 12 digits, 303 have 13).
- **Config parameters:** `barcode.max_time_between_keys_in_ms=100`, `stock_barcode.barcode_separator_regex=[;,]`, sound on.
- **`barcode_service.js`:**
  - An Android WebView counts as "mobile Chrome" (UA contains `Android` + `Chrome`), so Odoo keeps a hidden `input.o-barcode-input` and reads its value on Enter. This is the path `src/utils/odooBarcodeScript.ts` uses.
  - `cleanBarcode` strips the substrings `Alt`, `Shift` and `Control`.
  - Codes under 3 characters are dropped.
  - Keys aimed at an editable field are left to that field.
- **Outside the Barcode app:** only the commands `OBT<x>` (click `[barcode_trigger=x]`) and `OCDEDIT/DISC/SAVE/PREV/NEXT/…` do something. Any other scan on a normal Odoo screen with no focused field does **nothing**.

## What a scan finds (`stock_barcode`)

Matching is always by exact string. **`default_code` is never searched**, so 3,816 of 4,702 active products cannot be found by scanning.

- **Main menu** (`/stock_barcode/scan_from_main_menu`). Checked in this order:
  1. batch name;
  2. MO name;
  3. picking name → opens the picking;
  4. operation-type barcode (`<WH>IN/OUT/INT/MANUF`) → **creates a new picking or MO**;
  5. internal location barcode (`<WH>STOCK`) → **creates and confirms an internal transfer**;
  6. product `barcode` → shows its stock (quant list);
  7. lot (only with the lots group, which is off) → package.

  If nothing matches: danger toast "No picking or location or product corresponding to barcode …".
- **Picking, batch and count screens:**
  - First, commands: `OBTVALI`, `OBTPACK`, `OBTPRSL`, `OBTSCRA`, `OBTRETU`, `OCDCANC`; on counts `OBTAPPLY`.
  - Then, in order: location (changes source/destination) → package → product (adds or increments a line) → lot.
  - **A scan is ignored unless the screen shows the line list**, e.g. while the line editor is open.
  - A code with `,` or `;` is split into several scans.
- **Unmatched code on a tracked line:** becomes a **new lot/serial name** (when lot creation is allowed).
- **Unknown product:** toast "You are expected to scan one or more products or a package…".
- **Validate:**
  - Shows the backorder dialog (`create_backorder=ask` on every operation type), then calls `button_validate` (`barcode_trigger=True`).
  - Success toast "The transfer has been validated"; counts show "The inventory count has been updated".
- **Routes:** all are `auth='user'`, none use `sudo` on business data.

### Operation-type options (all types identical)

| Option | Value |
| --- | --- |
| `barcode_allow_extra_product` | true → ConfirmationDialog "Add extra product?" |
| `barcode_validation_full` | true |
| `restrict_scan_dest_location`, `restrict_scan_tracking_number`, `restrict_put_in_pack` | optional |
| `restrict_scan_source_location` | no |
| `restrict_scan_product`, `show_reserved_sns` | false |

## MAES data the Barcode app works on (test-box counts)

| Item | Value |
| --- | --- |
| Feature groups implied for internal users | multi-locations, packages, UoM on; **lots/serials off** (although 10 templates are serial-tracked, 18 on live) |
| Location barcodes | 12 (`<WH>STOCK` only); 148 shelf/bin locations have none |
| Stock | all internal quants are in MAG/Stock |
| Barcode-app use | no sign of it yet: 0 move lines with `location_processed`; pickings created by admin/system from sale and purchase orders |
| Batches | 351, auto-batched per partner on 22 operation types |
| Packaging barcodes (`product.uom`) | 0 |

## Interaction with `odoo19Module`

- **On the validate path:** only `stock.picking._action_done` / `action_cancel` (`models/fsm_material_light.py:108,113`), which refreshes the material light on linked field service tasks.
  - No custom `button_validate`, quant, lot or move-line logic.
  - No JS patch of barcode components, and no view inherits a `stock_barcode` view.
- **Barcode menu hidden for technicians:** `models/ir_ui_menu_technician.py` hides `stock_barcode.stock_barcode_menu` for `group_fsm_tech` (9 users), at the client's request (§P305).
  - The URL `/odoo/barcode` still works for them.
  - The app's Barcode-tile click hook never fires for them.
- **Mark as done can overwrite what was picked in Barcode:** `_settle_material_usage` re-validates deliveries with the technician's used quantity. See `odoo-module-review.md`.
- **Serials on installed products:** `customer.product.line.serial_number` is free text, with no link to `stock.lot`, moves or pickings.
- **Van flows** (consumption/replenishment wizards validate pickings headlessly) are off until 2027-01-01. A full count is planned for 2026-12-31, an obvious Barcode-app use.

## Gaps for the handheld flow (app side)

1. **`default_code` lookup is missing.** It needs the "Add Product" line form (its name search matches `default_code`) or a backend change (`/odoo-api-contract`). 34 `default_code`s contain `,`/`;`, so they split when scanned.
2. **Answers that are not toasts are invisible behind the app's scanner screen:** "Add extra product?", the backorder dialog, wizards opened by validate. Scans dropped by the line-list rule give no feedback at all.
3. **Results can arrive late:** main-menu scans cost an RPC plus `doAction`, and the first scan of an uncached product costs a lazy RPC. Either can take longer than `BARCODE_RESULT_DELAY_MS` (1.5 s).
4. **Notification levels are misread:** success toasts are `bg-success` but the script reports them as `info`. Toast text is translated (5 users on `nl_NL`), so the app must use the level, never the text.
5. **Main-menu scans with side effects:** scanning a type or location barcode creates records.
6. **The scanner's code formats must match Odoo's:** check the UPC-A/EAN-13 expansion and check-digit settings against the stored strings. GS1/DataMatrix payloads are treated as one plain barcode.
