/**
 * @format
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { CountData, Product, Quant } from '../src/api/barcode';
import {
  BarcodeContext,
  BarcodeContextValue,
} from '../src/navigation/barcodeContext';
import CountScreen from '../src/screens/barcode/CountScreen';

jest.useFakeTimers();

// Synthetic data only.
const product = (id: number): Product => ({
  id,
  name: `Test product ${id}`,
  code: `TP-${id}`,
  barcode: null,
  tracking: 'none',
  uomId: 1,
  isStorable: true,
});

const quant = (
  id: number,
  quantity: number,
  counted: number | null,
): Quant => ({
  id,
  productId: id,
  locationId: 8,
  lotId: null,
  quantity,
  inventoryQuantity: counted ?? 0,
  inventoryQuantitySet: counted !== null,
  inventoryDate: null,
  userId: 2,
  packageId: null,
});

const mockData: CountData = {
  quants: [quant(1, 4, 4), quant(2, 5, 3), quant(3, 2, null)],
  products: { 1: product(1), 2: product(2), 3: product(3) },
  locations: {
    8: {
      id: 8,
      name: 'WH/Stock',
      barcode: null,
      usage: 'internal',
      parentPath: '1/8/',
    },
  },
  lots: {},
  uoms: { 1: 'Units' },
  showQuantity: true,
  userId: 2,
  groups: { multiLocations: true, lots: false, packages: false, uom: false },
};

jest.mock('../src/api/barcode', () => ({
  ...jest.requireActual('../src/api/barcode'),
  getCountData: jest.fn(async () => mockData),
}));

const context: BarcodeContextValue = {
  nav: {
    push: jest.fn(),
    replace: jest.fn(),
    pop: jest.fn(),
    openOdoo: jest.fn(),
    signIn: jest.fn(),
    openStatus: jest.fn(),
  },
  scanner: { state: 'unavailable', restart: jest.fn() },
  session: { uid: 2, name: 'Test user', lang: 'en_US' },
  setScanHandler: jest.fn(),
  setBackHandler: jest.fn(),
  menuTab: null,
  setMenuTab: jest.fn(),
};

test('the overview counts matching, different and still-to-count lines', async () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    r = ReactTestRenderer.create(
      <BarcodeContext.Provider value={context}>
        <CountScreen />
      </BarcodeContext.Provider>,
    );
  });
  await ReactTestRenderer.act(async () => {
    jest.runOnlyPendingTimers();
  });
  const [overview] = r.root
    .findAllByProps({ testID: 'count-overview' })
    .filter(n => n.props.accessibilityLabel);
  expect(overview.props.accessibilityLabel).toBe(
    'Products here: 3, Counted: 1, Different: 1, To count: 1',
  );
  const shown = r.root
    .findAllByType(Text)
    .map(n => n.props.children)
    .filter(x => typeof x === 'string');
  expect(shown).toContain('Differences: 1');
  // Counted 3 of 5 on hand.
  expect(shown).toContain('−2');
  expect(shown).toContain('Products (3)');
});
