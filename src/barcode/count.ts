import type { CountData, LineCommand, Quant } from '../api/barcode';
import type { LineKey } from './picking';

/**
 * The inventory count's model, mirroring Odoo's `BarcodeQuantModel`
 * (`stock_barcode/static/src/models/barcode_quant_model.js`): count lines are
 * quants with a counted quantity; new ones are created through
 * `stock.quant.barcode_write`.
 */

export type CountLine = Quant & {
  key: LineKey;
  isNew: boolean;
  /** A new lot/serial to create with the quant. */
  lotName: string | null;
};

export type CountEvent =
  | {
      type: 'add';
      productId: number;
      locationId: number;
      qty: number;
      lotId?: number | null;
      lotName?: string | null;
      newKey: LineKey;
    }
  | { type: 'set'; key: LineKey; qty: number };

export type CountView = {
  lines: CountLine[];
  touched: Record<LineKey, LineKey>;
};

export function quantKey(id: number): LineKey {
  return `id:${id}`;
}

export function applyCountEvents(
  data: CountData,
  events: CountEvent[],
  aliases: Record<LineKey, LineKey> = {},
): CountView {
  const lines: CountLine[] = data.quants.map(q => ({
    ...q,
    key: quantKey(q.id),
    isNew: false,
    lotName: null,
  }));
  const touched: Record<LineKey, LineKey> = {};
  const resolve = (key: LineKey) => touched[key] ?? aliases[key] ?? key;
  for (const e of events) {
    if (e.type === 'set') {
      const line = lines.find(l => l.key === resolve(e.key));
      if (line) {
        line.inventoryQuantity = Math.max(0, e.qty);
        line.inventoryQuantitySet = true;
      }
      continue;
    }
    const lotName = e.lotName ?? null;
    const sameLot = (l: CountLine) =>
      e.lotId
        ? l.lotId === e.lotId
        : lotName
        ? l.lotName === lotName ||
          (l.lotId !== null && data.lots[l.lotId]?.name === lotName)
        : l.lotId === null && l.lotName === null;
    const target =
      lines.find(l => l.key === (aliases[e.newKey] ?? e.newKey)) ??
      lines.find(
        l =>
          l.productId === e.productId &&
          l.locationId === e.locationId &&
          sameLot(l) &&
          l.packageId === null,
      );
    if (target) {
      // Odoo starts a not-yet-counted quant at the scanned quantity.
      target.inventoryQuantity = target.inventoryQuantitySet
        ? target.inventoryQuantity + e.qty
        : e.qty;
      target.inventoryQuantitySet = true;
      touched[e.newKey] = target.key;
      continue;
    }
    const key = aliases[e.newKey] ?? e.newKey;
    lines.push({
      id: 0,
      key,
      isNew: true,
      productId: e.productId,
      locationId: e.locationId,
      lotId: e.lotId ?? null,
      quantity: 0,
      inventoryQuantity: e.qty,
      inventoryQuantitySet: true,
      inventoryDate: null,
      userId: data.userId,
      packageId: null,
      lotName,
    });
    touched[e.newKey] = key;
  }
  return { lines, touched };
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Commands for `barcode_write`, like Odoo's `_getSaveLineCommand`. */
export function countCommands(data: CountData, view: CountView): LineCommand[] {
  const before = new Map(data.quants.map(q => [q.id, q]));
  const commands: LineCommand[] = [];
  for (const line of view.lines) {
    if (line.isNew) {
      commands.push([
        0,
        0,
        {
          dummy_id: line.key,
          inventory_date: today(),
          inventory_quantity: line.inventoryQuantity,
          inventory_quantity_set: true,
          location_id: line.locationId,
          lot_id: line.lotId ?? false,
          lot_name: line.lotName ?? false,
          package_id: false,
          product_id: line.productId,
          owner_id: false,
          user_id: data.userId ?? false,
        },
      ]);
      continue;
    }
    const old = before.get(line.id);
    if (
      old &&
      (old.inventoryQuantity !== line.inventoryQuantity ||
        old.inventoryQuantitySet !== line.inventoryQuantitySet)
    ) {
      commands.push([
        1,
        line.id,
        {
          inventory_quantity: line.inventoryQuantity,
          inventory_quantity_set: line.inventoryQuantitySet,
          user_id: data.userId ?? false,
        },
      ]);
    }
  }
  return commands;
}

/** Merges the quants a save (or `get_quants`) returned into the count's data. */
export function mergeCountData(base: CountData, extra: CountData): CountData {
  const quants = new Map(base.quants.map(q => [q.id, q]));
  for (const q of extra.quants) {
    quants.set(q.id, q);
  }
  return {
    ...base,
    quants: [...quants.values()],
    products: { ...base.products, ...extra.products },
    locations: { ...base.locations, ...extra.locations },
    lots: { ...base.lots, ...extra.lots },
    uoms: { ...base.uoms, ...extra.uoms },
  };
}

export function countAliasesAfterSave(
  saved: CountView,
  before: CountData,
  after: CountData,
): Record<LineKey, LineKey> {
  const oldIds = new Set(before.quants.map(q => q.id));
  const aliases: Record<LineKey, LineKey> = {};
  const used = new Set<number>();
  for (const line of saved.lines) {
    if (!line.isNew) {
      continue;
    }
    const sameLot = (q: Quant) =>
      line.lotId
        ? q.lotId === line.lotId
        : line.lotName
        ? q.lotId !== null && after.lots[q.lotId]?.name === line.lotName
        : q.lotId === null;
    const candidates = after.quants.filter(
      q =>
        !used.has(q.id) &&
        q.productId === line.productId &&
        q.locationId === line.locationId &&
        q.packageId === null &&
        sameLot(q),
    );
    // A quant Odoo just created first; else the existing one it counted on.
    const match =
      candidates.find(q => !oldIds.has(q.id)) ??
      candidates.find(q => q.inventoryQuantitySet);
    if (match) {
      used.add(match.id);
      aliases[line.key] = quantKey(match.id);
    }
  }
  for (const [newKey, target] of Object.entries(saved.touched)) {
    const real = target.startsWith('v:') ? aliases[target] : target;
    if (real && newKey !== real) {
      aliases[newKey] = real;
    }
  }
  return aliases;
}

/** Lines shown for one location: counted first, then the ones to count. */
export function linesForLocation(
  view: CountView,
  locationId: number,
): CountLine[] {
  return view.lines
    .filter(l => l.locationId === locationId)
    .sort(
      (a, b) => Number(b.inventoryQuantitySet) - Number(a.inventoryQuantitySet),
    );
}

export function countedLines(view: CountView): CountLine[] {
  return view.lines.filter(l => l.inventoryQuantitySet && l.id > 0);
}
