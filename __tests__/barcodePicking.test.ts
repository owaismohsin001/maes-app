/**
 * @format
 */

import type { MoveLine, PickingData, Product } from '../src/api/barcode';
import {
  PickingEvent,
  aliasesAfterSave,
  applyPickingEvents,
  carryReserved,
  barcodeCommand,
  lotAlreadyUsed,
  pickingCommands,
  pickingProgress,
  productRows,
  uncompletedRows,
} from '../src/barcode/picking';

// Synthetic fixtures only (contractual: no client data).
const product = (id: number, extra: Partial<Product> = {}): Product => ({
  id,
  name: `Test product ${id}`,
  code: `TP-${id}`,
  barcode: `99900000000${id}`,
  tracking: 'none',
  uomId: 1,
  isStorable: true,
  ...extra,
});

const line = (id: number, extra: Partial<MoveLine> = {}): MoveLine => ({
  id,
  productId: 1,
  moveId: 10,
  locationId: 100,
  locationDestId: 200,
  qtyDone: 0,
  quantity: 2,
  picked: false,
  lotId: null,
  lotName: null,
  uomId: 1,
  packageId: null,
  resultPackageId: null,
  ...extra,
  reserved: extra.reserved ?? extra.quantity ?? 2,
});

function picking(extra: Partial<PickingData> = {}): PickingData {
  return {
    picking: {
      id: 7,
      name: 'TEST/OUT/00001',
      state: 'assigned',
      code: 'outgoing',
      typeId: 3,
      partnerId: null,
      locationId: 100,
      locationDestId: 200,
      note: null,
      useCreateLots: false,
      useExistingLots: true,
      isReturn: false,
    },
    moves: [{ id: 10, productId: 1, demand: 2, lineIds: [1] }],
    lines: [line(1)],
    products: { 1: product(1), 2: product(2) },
    locations: {},
    lots: {},
    uoms: { 1: 'Units' },
    partners: {},
    config: {
      allowExtraProduct: true,
      validationFull: true,
      createBackorder: 'ask',
      restrictScanProduct: false,
      restrictScanSourceLocation: false,
      restrictScanDestLocation: 'optional',
      restrictScanTrackingNumber: false,
      linesNeedDestinationLocation: false,
      linesNeedToBePacked: false,
    },
    sourceLocationIds: [100],
    destLocationIds: [200],
    groups: { multiLocations: true, lots: false, packages: false, uom: false },
    ...extra,
  };
}

const add = (productId: number, newKey: string, more = {}): PickingEvent => ({
  type: 'add',
  productId,
  qty: 1,
  newKey,
  ...more,
});

test('a scan fills the reserved line first, like Odoo', () => {
  const data = picking();
  const view = applyPickingEvents(data, [add(1, 'v:1')]);
  expect(view.lines).toHaveLength(1);
  expect(view.lines[0]).toMatchObject({
    key: 'id:1',
    qtyDone: 1,
    picked: true,
  });
  expect(view.touched['v:1']).toBe('id:1');

  expect(pickingCommands(data, view)).toEqual([[1, 1, { qty_done: 1 }]]);
});

test('scanning past the reserved quantity keeps counting on the same line', () => {
  const data = picking();
  const view = applyPickingEvents(data, [
    add(1, 'v:1'),
    add(1, 'v:2'),
    add(1, 'v:3'),
  ]);
  expect(view.lines).toHaveLength(1);
  expect(view.lines[0].qtyDone).toBe(3);
});

test('an extra product becomes a new line with the create values Odoo expects', () => {
  const data = picking();
  const view = applyPickingEvents(data, [add(2, 'v:1', { locationId: 101 })]);
  expect(view.lines).toHaveLength(2);
  const [cmd] = pickingCommands(data, view);
  expect(cmd[0]).toBe(0);
  expect(cmd[2]).toMatchObject({
    dummy_id: 'v:1',
    picking_id: 7,
    product_id: 2,
    product_uom_id: 1,
    location_id: 101,
    location_dest_id: 200,
    quantity: 1,
    picked: true,
    lot_name: false,
    state: 'assigned',
  });
});

test('serials go one per line, and a used serial is detected', () => {
  const data = picking({
    products: { 1: product(1, { tracking: 'serial' }) },
    lines: [line(1, { quantity: 1 }), line(2, { quantity: 1 })],
  });
  const view = applyPickingEvents(data, [
    add(1, 'v:1', { lotName: 'SN-TEST-A' }),
    add(1, 'v:2', { lotName: 'SN-TEST-B' }),
  ]);
  expect(view.lines.map(l => l.lotName)).toEqual(['SN-TEST-A', 'SN-TEST-B']);
  expect(lotAlreadyUsed(data, view, 1, 'SN-TEST-A')).toBe(true);
  expect(lotAlreadyUsed(data, view, 1, 'SN-TEST-C')).toBe(false);
  expect(pickingCommands(data, view)).toEqual([
    [1, 1, { qty_done: 1, lot_name: 'SN-TEST-A' }],
    [1, 2, { qty_done: 1, lot_name: 'SN-TEST-B' }],
  ]);
});

test('a destination scan applies to the lines scanned since the last one', () => {
  const data = picking();
  const view = applyPickingEvents(data, [
    add(1, 'v:1'),
    { type: 'dest', keys: ['id:1'], locationId: 201 },
  ]);
  expect(view.lines[0].locationDestId).toBe(201);
  expect(pickingCommands(data, view)).toEqual([
    [1, 1, { qty_done: 1, location_dest_id: 201 }],
  ]);
});

test('setting a quantity by hand', () => {
  const data = picking();
  const view = applyPickingEvents(data, [{ type: 'set', key: 'id:1', qty: 2 }]);
  expect(view.lines[0].qtyDone).toBe(2);
  const neg = applyPickingEvents(data, [{ type: 'set', key: 'id:1', qty: -3 }]);
  expect(neg.lines[0].qtyDone).toBe(0);
});

test('events made during a save still find the line Odoo created', () => {
  const data = picking();
  const events = [add(2, 'v:1')];
  const saved = applyPickingEvents(data, events);
  const after = picking({
    lines: [
      line(1),
      line(9, {
        productId: 2,
        moveId: 11,
        qtyDone: 1,
        quantity: 1,
        picked: true,
      }),
    ],
    moves: [...data.moves, { id: 11, productId: 2, demand: 0, lineIds: [9] }],
  });
  const aliases = aliasesAfterSave(saved, data, after);
  expect(aliases).toEqual({ 'v:1': 'id:9' });

  // A later "set" on the app's key lands on Odoo's line, without a new create.
  const later = applyPickingEvents(
    after,
    [{ type: 'set', key: 'v:1', qty: 4 }],
    aliases,
  );
  expect(pickingCommands(after, later)).toEqual([[1, 9, { qty_done: 4 }]]);
});

test('rows, progress and what would go to a backorder', () => {
  const data = picking({
    moves: [
      { id: 10, productId: 1, demand: 2, lineIds: [1] },
      { id: 11, productId: 2, demand: 1, lineIds: [] },
    ],
  });
  const view = applyPickingEvents(data, [add(1, 'v:1')]);
  const rows = productRows(data, view);
  expect(rows.map(r => [r.productId, r.done, r.demand])).toEqual([
    [1, 1, 2],
    [2, 0, 1],
  ]);
  expect(pickingProgress(rows)).toEqual({
    done: 1,
    demand: 3,
    complete: false,
  });
  expect(uncompletedRows(rows).map(r => r.productId)).toEqual([1, 2]);
});

test('command barcodes', () => {
  expect(barcodeCommand('O-BTN.validate')).toBe('validate');
  expect(barcodeCommand('OBTVALI')).toBe('validate');
  expect(barcodeCommand('OCDMENU')).toBe('menu');
  expect(barcodeCommand('O-BTN.pack')).toBe('unsupported');
  expect(barcodeCommand('9990000000001')).toBeNull();
});

test('a destination scanned after a save still reaches the scanned lines', () => {
  const data = picking();
  // Scan, then the save runs (the scan landed on reserved line 1)…
  const saved = applyPickingEvents(data, [add(1, 'v:1')]);
  const after = carryReserved(
    data,
    picking({ lines: [line(1, { qtyDone: 1, quantity: 1, picked: true })] }),
  );
  const aliases = aliasesAfterSave(saved, data, after);
  expect(aliases).toEqual({ 'v:1': 'id:1' });
  // …then the shelf is scanned with the scan's own key.
  const view = applyPickingEvents(
    after,
    [{ type: 'dest', keys: ['v:1'], locationId: 201 }],
    aliases,
  );
  expect(pickingCommands(after, view)).toEqual([
    [1, 1, { location_dest_id: 201 }],
  ]);
});

test('the reservation survives a save, so scans keep filling the reserved line', () => {
  const data = picking();
  const after = carryReserved(
    data,
    picking({ lines: [line(1, { qtyDone: 1, quantity: 1, picked: true })] }),
  );
  expect(after.lines[0].reserved).toBe(2);
  const view = applyPickingEvents(after, [add(1, 'v:2')]);
  expect(view.lines).toHaveLength(1);
  expect(view.lines[0].qtyDone).toBe(2);
});
