/**
 * @format
 */

import type { CountData, Quant } from '../src/api/barcode';
import {
  applyCountEvents,
  countAliasesAfterSave,
  countCommands,
  countedLines,
  linesForLocation,
  mergeCountData,
} from '../src/barcode/count';

// Synthetic fixtures only.
const quant = (id: number, extra: Partial<Quant> = {}): Quant => ({
  id,
  productId: 1,
  locationId: 100,
  lotId: null,
  quantity: 5,
  inventoryQuantity: 0,
  inventoryQuantitySet: false,
  inventoryDate: '2026-10-26',
  userId: null,
  packageId: null,
  ...extra,
});

const count = (quants: Quant[]): CountData => ({
  quants,
  products: {},
  locations: {},
  lots: {},
  uoms: {},
  showQuantity: false,
  userId: 42,
  groups: { multiLocations: true, lots: false, packages: false, uom: false },
});

test('the first scan of a quant counts 1, the next ones add up', () => {
  const data = count([quant(1)]);
  const view = applyCountEvents(data, [
    { type: 'add', productId: 1, locationId: 100, qty: 1, newKey: 'v:1' },
    { type: 'add', productId: 1, locationId: 100, qty: 1, newKey: 'v:2' },
  ]);
  expect(view.lines[0]).toMatchObject({
    inventoryQuantity: 2,
    inventoryQuantitySet: true,
  });
  expect(countCommands(data, view)).toEqual([
    [
      1,
      1,
      { inventory_quantity: 2, inventory_quantity_set: true, user_id: 42 },
    ],
  ]);
});

test('a product with no quant here becomes a new counted quant', () => {
  const data = count([]);
  const view = applyCountEvents(data, [
    { type: 'add', productId: 3, locationId: 101, qty: 1, newKey: 'v:1' },
  ]);
  const [cmd] = countCommands(data, view);
  expect(cmd[0]).toBe(0);
  expect(cmd[2]).toMatchObject({
    dummy_id: 'v:1',
    product_id: 3,
    location_id: 101,
    inventory_quantity: 1,
    inventory_quantity_set: true,
    user_id: 42,
    lot_id: false,
    lot_name: false,
  });
  expect(cmd[2].inventory_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('setting a counted quantity by hand, and lines per location', () => {
  const data = count([quant(1), quant(2, { locationId: 101 })]);
  const view = applyCountEvents(data, [{ type: 'set', key: 'id:2', qty: 7 }]);
  expect(linesForLocation(view, 101).map(l => l.inventoryQuantity)).toEqual([
    7,
  ]);
  expect(countedLines(view).map(l => l.id)).toEqual([2]);
});

test('a save answer is merged, and new quants get their Odoo ids', () => {
  const data = count([quant(1)]);
  const saved = applyCountEvents(data, [
    { type: 'add', productId: 3, locationId: 100, qty: 1, newKey: 'v:1' },
  ]);
  const answer = count([
    quant(8, {
      productId: 3,
      inventoryQuantity: 1,
      inventoryQuantitySet: true,
    }),
  ]);
  const merged = mergeCountData(data, answer);
  expect(merged.quants.map(q => q.id)).toEqual([1, 8]);
  expect(countAliasesAfterSave(saved, data, merged)).toEqual({ 'v:1': 'id:8' });
});

test('the same new lot scanned twice is one new quant, not two', () => {
  const data = count([]);
  const view = applyCountEvents(data, [
    {
      type: 'add',
      productId: 3,
      locationId: 100,
      qty: 1,
      lotName: 'LOT-T1',
      newKey: 'v:1',
    },
    {
      type: 'add',
      productId: 3,
      locationId: 100,
      qty: 1,
      lotName: 'LOT-T1',
      newKey: 'v:2',
    },
  ]);
  const cmds = countCommands(data, view);
  expect(cmds).toHaveLength(1);
  expect(cmds[0][2]).toMatchObject({
    lot_name: 'LOT-T1',
    inventory_quantity: 2,
  });
});

test("a new lot's alias never points at another lot's quant", () => {
  const data = count([
    quant(10, { productId: 3, lotId: 5, inventoryQuantitySet: true }),
  ]);
  const saved = applyCountEvents(data, [
    {
      type: 'add',
      productId: 3,
      locationId: 100,
      qty: 1,
      lotName: 'LOT-T2',
      newKey: 'v:1',
    },
  ]);
  const answer = {
    ...count([
      quant(11, {
        productId: 3,
        lotId: 6,
        inventoryQuantity: 1,
        inventoryQuantitySet: true,
      }),
    ]),
    lots: { 6: { id: 6, name: 'LOT-T2', productId: 3 } },
  };
  const merged = mergeCountData(data, answer);
  expect(countAliasesAfterSave(saved, data, merged)).toEqual({
    'v:1': 'id:11',
  });
});
