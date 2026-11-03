/**
 * @format
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { ProductRow } from '../src/barcode/picking';
import PickingDone from '../src/screens/barcode/PickingDone';

jest.useFakeTimers();

const row = (productId: number, done: number, demand: number): ProductRow => ({
  key: String(productId),
  productId,
  demand,
  done,
  lines: [],
  lots: [],
  extra: false,
});

async function render(
  props: Partial<React.ComponentProps<typeof PickingDone>>,
) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PickingDone
        code="incoming"
        name="WH/IN/00001"
        partner="Demo Supplier"
        rows={[row(1, 1, 1), row(2, 3, 3), row(3, 0, 1)]}
        route={null}
        backorders={[]}
        onOpenBackorder={jest.fn()}
        onBack={jest.fn()}
        {...props}
      />,
    );
  });
  await ReactTestRenderer.act(() => jest.runAllTimers());
  return renderer;
}

const texts = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(Text)
    .map(n => [n.props.children].flat().join(''))
    .join('\n');
const byTestID = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAllByProps({ testID: id });

test('says what was validated, for whom, and what was done', async () => {
  const r = await render({});
  const shown = texts(r);
  expect(shown).toContain('Receipt validated');
  expect(shown).toContain('WH/IN/00001 · Demo Supplier');
  // Products with something done (2 of 3), and their units (1 + 3).
  expect(shown).toMatch(/2\nProducts/);
  expect(shown).toMatch(/4\nUnits done/);
  expect(byTestID(r, 'picking-done-mark').length).toBeGreaterThan(0);
  expect(byTestID(r, 'picking-done-backorders')).toHaveLength(0);
});

test('names deliveries and internal transfers too', async () => {
  expect(texts(await render({ code: 'outgoing' }))).toContain(
    'Delivery validated',
  );
  expect(texts(await render({ code: 'internal' }))).toContain(
    'Transfer validated',
  );
});

test('a backorder is shown and opens; Back to the list leaves', async () => {
  const onOpenBackorder = jest.fn();
  const onBack = jest.fn();
  const r = await render({
    backorders: [{ id: 42, name: 'WH/IN/00002' }],
    onOpenBackorder,
    onBack,
  });
  expect(texts(r)).toContain('Backorder created');
  expect(texts(r)).toContain('WH/IN/00002');

  await ReactTestRenderer.act(() =>
    byTestID(r, 'picking-done-backorder-42')[0].props.onPress(),
  );
  expect(onOpenBackorder).toHaveBeenCalledWith(42);

  await ReactTestRenderer.act(() =>
    byTestID(r, 'picking-done-back')[0].props.onPress(),
  );
  expect(onBack).toHaveBeenCalledTimes(1);
});
