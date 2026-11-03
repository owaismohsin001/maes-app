/**
 * @format
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import LoadingView from '../src/components/LoadingView';
import LogoSpinner from '../src/components/LogoSpinner';
import { LOGO_RING, LOGO_RING_DIAMETER } from '../src/assets/logo';
import { t } from '../src/i18n';

jest.useFakeTimers();

type Json = ReactTestRenderer.ReactTestRendererJSON;
type Node = Json | string | null;

async function render(element: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(element);
  });
  return renderer;
}

/** First host node in the rendered tree matching `pred`. */
function find(node: Node | Node[], pred: (n: Json) => boolean): Json | null {
  if (!node || typeof node === 'string') {
    return null;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, pred);
      if (hit) {
        return hit;
      }
    }
    return null;
  }
  return pred(node) ? node : find(node.children ?? [], pred);
}

const byTestID = (tree: Node | Node[], id: string) =>
  find(tree, n => n.props?.testID === id);
const byType = (tree: Node | Node[], type: string) =>
  find(tree, n => n.type === type);
const styleOf = (node: Json | null) => StyleSheet.flatten(node?.props.style);

test('mark variant: only the "M", with the ring filling the whole square', async () => {
  const renderer = await render(<LogoSpinner size={64} />);
  const tree = renderer.toJSON();
  const json = JSON.stringify(tree);

  expect(json).toContain('maes_logo_m.png');
  expect(json).not.toContain('maes_logo_mark.png');

  const ring = styleOf(byTestID(tree, 'logo-spinner-ring'));
  expect(ring).toMatchObject({ left: 0, top: 0, width: 64, height: 64 });
  expect(ring.borderTopColor).toBe('transparent');
  expect(styleOf(byTestID(tree, 'logo-spinner'))).toMatchObject({
    width: 64,
    height: 64,
  });

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('full variant: whole logo, ring at the measured position of the "M"', async () => {
  // size = source diameter → 1 dp per source px, so positions equal the measurements.
  const size = LOGO_RING_DIAMETER;
  const renderer = await render(<LogoSpinner variant="full" size={size} />);
  const tree = renderer.toJSON();
  const json = JSON.stringify(tree);

  expect(json).toContain('maes_logo_mark.png');
  expect(json).not.toContain('maes_logo_m.png');

  expect(styleOf(byTestID(tree, 'logo-spinner'))).toMatchObject({
    width: 268,
    height: 160,
  });
  const ring = styleOf(byTestID(tree, 'logo-spinner-ring'));
  expect(ring.left).toBeCloseTo(LOGO_RING.cx - LOGO_RING.rOuter);
  expect(ring.top).toBeCloseTo(LOGO_RING.cy - LOGO_RING.rOuter);
  expect(ring.width).toBeCloseTo(size);
  expect(ring.borderWidth).toBeCloseTo(LOGO_RING.stroke);

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('colour applies to both the logo and the ring; label is announced', async () => {
  const renderer = await render(<LogoSpinner color="#FF0000" />);
  const tree = renderer.toJSON();

  expect(styleOf(byType(tree, 'Image')).tintColor).toBe('#FF0000');
  expect(styleOf(byTestID(tree, 'logo-spinner-ring')).borderColor).toBe(
    '#FF0000',
  );
  const root = byTestID(tree, 'logo-spinner');
  expect(root?.props.accessibilityRole).toBe('progressbar');
  expect(root?.props.accessibilityLabel).toBe(t('common.loading'));

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('LoadingView shows the spinner with an optional label', async () => {
  const renderer = await render(
    <LoadingView variant="full" label="Fetching product" />,
  );
  const json = JSON.stringify(renderer.toJSON());

  expect(json).toContain('maes_logo_mark.png');
  expect(json).toContain('Fetching product');

  await ReactTestRenderer.act(() => renderer.unmount());
});
