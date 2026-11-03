import type {
  LineCommand,
  Location,
  MoveLine,
  PickingData,
  Product,
} from '../api/barcode';

/**
 * The transfer screen's model, mirroring Odoo's `BarcodePickingModel`
 * (`stock_barcode/static/src/models/barcode_picking_model.js`) for receipts,
 * deliveries and internal transfers without packages.
 *
 * What the user did is kept as a list of events on top of the last data Odoo
 * returned; `applyPickingEvents` replays them, `pickingCommands` turns the
 * difference into the ORM commands Odoo's Barcode app sends to
 * `/stock_barcode/save_barcode_data`.
 */

/** `id:<n>` for a line Odoo has, `v:<n>` for one only the app has yet. */
export type LineKey = string;

export type WorkLine = MoveLine & { key: LineKey; isNew: boolean };

export type PickingEvent =
  | {
      type: 'add';
      productId: number;
      qty: number;
      lotId?: number | null;
      lotName?: string | null;
      /** Source location for a new line (last scanned), else the picking's. */
      locationId?: number | null;
      /** Key for the line this event may create. */
      newKey: LineKey;
    }
  | { type: 'set'; key: LineKey; qty: number }
  | { type: 'dest'; keys: LineKey[]; locationId: number };

export type PickingView = {
  lines: WorkLine[];
  /** The line each `add` event ended up on, by the event's `newKey`. */
  touched: Record<LineKey, LineKey>;
};

export function realKey(id: number): LineKey {
  return `id:${id}`;
}

export function isVirtualKey(key: LineKey): boolean {
  return key.startsWith('v:');
}

function sameLot(
  line: MoveLine,
  lotId: number | null | undefined,
  lotName: string | null | undefined,
): boolean {
  if (lotId) {
    return line.lotId === lotId;
  }
  if (lotName) {
    return line.lotName === lotName;
  }
  return true;
}

/**
 * Where a scanned unit goes, like Odoo's `_findLine`: a line of this product
 * (and lot) that still has room, else one that was already picked (only
 * untracked / lot products), else a new line.
 */
function findLineForAdd(
  lines: WorkLine[],
  e: Extract<PickingEvent, { type: 'add' }>,
  product: Product | undefined,
): WorkLine | null {
  const sameProduct = lines.filter(l => l.productId === e.productId);
  // A reserved line without a lot/serial yet takes the scanned one.
  const unlotted = () =>
    sameProduct.find(
      l => !l.lotId && !l.lotName && l.qtyDone === 0 && l.reserved > 0,
    );
  if (product?.tracking === 'serial') {
    // One serial per line (a serial already on a line is rejected before an
    // event is made).
    return unlotted() ?? null;
  }
  const exact = sameProduct.filter(l => sameLot(l, e.lotId, e.lotName));
  const withRoom =
    exact.find(l => l.qtyDone < l.reserved) ??
    (e.lotId || e.lotName ? unlotted() : undefined);
  if (withRoom) {
    return withRoom;
  }
  // Same product (and lot) again: keep counting on the line picked last.
  return [...exact].reverse().find(l => l.qtyDone > 0 || l.isNew) ?? null;
}

/** The lines as they are after replaying the user's events on Odoo's data. */
export function applyPickingEvents(
  data: PickingData,
  events: PickingEvent[],
  aliases: Record<LineKey, LineKey> = {},
): PickingView {
  const lines: WorkLine[] = data.lines.map(l => ({
    ...l,
    key: realKey(l.id),
    isNew: false,
  }));
  const touched: Record<LineKey, LineKey> = {};
  // An event's key: the line an earlier add of this replay landed on, the
  // Odoo line a saved one landed on, or the key itself.
  const resolve = (key: LineKey) => touched[key] ?? aliases[key] ?? key;

  for (const e of events) {
    if (e.type === 'add') {
      const product = data.products[e.productId];
      const target = findLineForAdd(lines, e, product);
      if (target) {
        target.qtyDone += e.qty;
        target.picked = true;
        if (e.lotId && !target.lotId) {
          target.lotId = e.lotId;
        }
        if (e.lotName && !target.lotName && !target.lotId) {
          target.lotName = e.lotName;
        }
        touched[e.newKey] = target.key;
        continue;
      }
      const key = aliases[e.newKey] ?? e.newKey;
      const existing = lines.find(l => l.key === key);
      if (existing) {
        existing.qtyDone += e.qty;
        touched[e.newKey] = key;
        continue;
      }
      lines.push({
        id: 0,
        key,
        isNew: true,
        productId: e.productId,
        moveId: null,
        locationId: e.locationId ?? data.picking.locationId,
        locationDestId: data.picking.locationDestId,
        qtyDone: e.qty,
        quantity: 0,
        reserved: 0,
        picked: true,
        lotId: e.lotId ?? null,
        lotName: e.lotName ?? null,
        uomId: product?.uomId ?? null,
        packageId: null,
        resultPackageId: null,
      });
      touched[e.newKey] = key;
    } else if (e.type === 'set') {
      const key = resolve(e.key);
      const line = lines.find(l => l.key === key);
      if (line) {
        line.qtyDone = Math.max(0, e.qty);
        line.picked = line.picked || e.qty > 0;
      }
    } else {
      const keys = new Set(e.keys.map(resolve));
      for (const line of lines) {
        if (keys.has(line.key)) {
          line.locationDestId = e.locationId;
        }
      }
    }
  }
  return { lines, touched };
}

/**
 * ORM commands for `move_line_ids` that turn Odoo's lines into `view`'s, in
 * the shape of Odoo's `_getSaveLineCommand` / `_createCommandVals`.
 */
export function pickingCommands(
  data: PickingData,
  view: PickingView,
): LineCommand[] {
  const commands: LineCommand[] = [];
  const before = new Map(data.lines.map(l => [l.id, l]));
  for (const line of view.lines) {
    if (line.isNew) {
      if (line.qtyDone <= 0) {
        continue;
      }
      commands.push([
        0,
        0,
        {
          dummy_id: line.key,
          is_entire_pack: false,
          location_id: line.locationId,
          location_dest_id: line.locationDestId,
          lot_name: line.lotName ?? false,
          lot_id: line.lotId ?? false,
          package_id: false,
          picking_id: data.picking.id,
          picked: true,
          product_id: line.productId,
          product_uom_id: line.uomId,
          owner_id: false,
          quantity: line.qtyDone,
          result_package_id: false,
          state: 'assigned',
        },
      ]);
      continue;
    }
    const old = before.get(line.id);
    if (!old) {
      continue;
    }
    const changed: Record<string, unknown> = {};
    if (line.qtyDone !== old.qtyDone) {
      changed.qty_done = line.qtyDone;
    }
    if (line.locationDestId !== old.locationDestId) {
      changed.location_dest_id = line.locationDestId;
    }
    if (line.lotId !== old.lotId) {
      changed.lot_id = line.lotId ?? false;
    }
    if (line.lotName !== old.lotName) {
      changed.lot_name = line.lotName ?? false;
    }
    if (Object.keys(changed).length) {
      commands.push([1, line.id, changed]);
    }
  }
  return commands;
}

/**
 * After a save: the Odoo line behind every key the saved events used (new
 * lines matched to the lines Odoo created), so events made while the save
 * was on its way still find their line.
 */
export function aliasesAfterSave(
  saved: PickingView,
  before: PickingData,
  after: PickingData,
): Record<LineKey, LineKey> {
  const oldIds = new Set(before.lines.map(l => l.id));
  const fresh = after.lines.filter(l => !oldIds.has(l.id));
  const used = new Set<number>();
  const aliases: Record<LineKey, LineKey> = {};
  for (const line of saved.lines) {
    if (!line.isNew || line.qtyDone <= 0) {
      continue;
    }
    const match = fresh.find(
      l =>
        !used.has(l.id) &&
        l.productId === line.productId &&
        (l.lotName ?? null) === (line.lotName ?? null) &&
        (l.lotId ?? null) === (line.lotId ?? null),
    );
    if (match) {
      used.add(match.id);
      aliases[line.key] = realKey(match.id);
    }
  }
  for (const [newKey, target] of Object.entries(saved.touched)) {
    const real = isVirtualKey(target) ? aliases[target] : target;
    if (real && newKey !== real) {
      aliases[newKey] = real;
    }
  }
  return aliases;
}

/**
 * Odoo's answer to a save, with each line's reservation as first loaded:
 * writing `qty_done` also sets `quantity`, so the reservation is lost there
 * (Odoo's client keeps it the same way). Lines created by the app have none.
 */
export function carryReserved(
  before: PickingData,
  after: PickingData,
): PickingData {
  const known = new Map(before.lines.map(l => [l.id, l.reserved]));
  return {
    ...after,
    lines: after.lines.map(l => ({ ...l, reserved: known.get(l.id) ?? 0 })),
  };
}

// -----------------------------------------------------------------------------
// What the screen shows
// -----------------------------------------------------------------------------

export type ProductRow = {
  key: string;
  productId: number;
  demand: number;
  done: number;
  lines: WorkLine[];
  /** Lots/serials picked so far. */
  lots: string[];
  /** Not part of the planned moves. */
  extra: boolean;
};

/** One row per product, in the order of the transfer's moves. */
export function productRows(
  data: PickingData,
  view: PickingView,
): ProductRow[] {
  const rows = new Map<number, ProductRow>();
  const order: number[] = [];
  const row = (productId: number) => {
    let r = rows.get(productId);
    if (!r) {
      r = {
        key: `p:${productId}`,
        productId,
        demand: 0,
        done: 0,
        lines: [],
        lots: [],
        extra: true,
      };
      rows.set(productId, r);
      order.push(productId);
    }
    return r;
  };
  for (const move of data.moves) {
    const r = row(move.productId);
    r.demand += move.demand;
    r.extra = false;
  }
  for (const line of view.lines) {
    const r = row(line.productId);
    r.done += line.qtyDone;
    r.lines.push(line);
    const lot = line.lotId ? data.lots[line.lotId]?.name : line.lotName;
    if (lot && line.qtyDone > 0) {
      r.lots.push(lot);
    }
  }
  return order.map(id => rows.get(id)!);
}

export type PickingProgress = {
  done: number;
  demand: number;
  complete: boolean;
};

export function pickingProgress(rows: ProductRow[]): PickingProgress {
  let done = 0;
  let demand = 0;
  for (const r of rows) {
    done += r.done;
    demand += r.demand;
  }
  return {
    done,
    demand,
    complete: rows.length > 0 && rows.every(r => r.extra || r.done >= r.demand),
  };
}

/** Products still short — the transfer would leave a backorder. */
export function uncompletedRows(rows: ProductRow[]): ProductRow[] {
  return rows.filter(r => !r.extra && r.done < r.demand);
}

// -----------------------------------------------------------------------------
// Matching a scanned code against the transfer's data
// -----------------------------------------------------------------------------

/** Barcode commands (`stock_barcode` aliases `O-BTN.validate` → `OBTVALI`). */
export type BarcodeCommand = 'validate' | 'menu' | 'unsupported';

export function barcodeCommand(code: string): BarcodeCommand | null {
  const c = code.trim().toUpperCase();
  if (c === 'OBTVALI' || c === 'O-BTN.VALIDATE') {
    return 'validate';
  }
  if (c === 'OCDMENU' || c === 'O-CMD.MAIN-MENU') {
    return 'menu';
  }
  if (/^(OBT|OCD|O-BTN\.|O-CMD\.)/.test(c)) {
    return 'unsupported';
  }
  return null;
}

export function productByBarcode(
  products: Record<number, Product>,
  code: string,
): Product | null {
  for (const p of Object.values(products)) {
    if (p.barcode === code) {
      return p;
    }
  }
  return null;
}

export function locationByBarcode(
  locations: Record<number, Location>,
  code: string,
): Location | null {
  for (const l of Object.values(locations)) {
    if (l.barcode === code) {
      return l;
    }
  }
  return null;
}

/** Whether a serial/lot is already on one of the product's picked lines. */
export function lotAlreadyUsed(
  data: PickingData,
  view: PickingView,
  productId: number,
  lot: string,
): boolean {
  return view.lines.some(
    l =>
      l.productId === productId &&
      l.qtyDone > 0 &&
      (l.lotName === lot ||
        (l.lotId !== null && data.lots[l.lotId]?.name === lot)),
  );
}
