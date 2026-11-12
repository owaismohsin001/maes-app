/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { WebView } from 'react-native-webview';
import App from '../App';
import { ODOO_WEB_URL } from '../src/config';
import { SPLASH_DURATION_MS } from '../src/screens/SplashScreen';
import { t } from '../src/i18n';

jest.useFakeTimers();

const rendered = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  JSON.stringify(renderer.toJSON());

// The splash renders the ring-less logo asset.
import { logoWithoutRing } from '../src/assets/logo';

// The brand's splash logo file (the jest preset mocks an image require as `{ testUri }`).
const SPLASH_LOGO = String((logoWithoutRing as { testUri: string }).testUri)
  .split('/')
  .pop()!;

test('keeps the splash up until Odoo is ready, then shows Odoo alone', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  // Async act: the scanner overlay asks the (mocked) native scanner for its status on mount.
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  expect(rendered(renderer)).toContain(SPLASH_LOGO);
  expect(rendered(renderer)).toContain(ODOO_WEB_URL); // loading behind it

  // Minimum splash time is over, but Odoo has not reported ready yet.
  await ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(SPLASH_DURATION_MS + 1000);
  });
  expect(rendered(renderer)).toContain(SPLASH_LOGO);

  await ReactTestRenderer.act(() => {
    renderer.root
      .findByType(WebView)
      .props.onMessage({ nativeEvent: { data: '{"type":"maes:page-ready"}' } });
  });
  await ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(1000);
  });
  expect(rendered(renderer)).toContain(ODOO_WEB_URL);
  expect(rendered(renderer)).not.toContain(SPLASH_LOGO);

  await ReactTestRenderer.act(() => {
    renderer.unmount();
  });
});

test('a locked device: the lock screen covers Odoo after the splash', async () => {
  const fetchMock = globalThis.fetch as unknown as jest.Mock;
  const allowed = (globalThis as unknown as { __allowedAnswer: () => object })
    .__allowedAnswer;
  fetchMock.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ ...allowed(), ok: false, reason: 'blocked' }),
    }),
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    await ReactTestRenderer.act(async () => {});
    await ReactTestRenderer.act(() => {
      renderer.root
        .findByType(WebView)
        .props.onMessage({ nativeEvent: { data: '{"type":"maes:page-ready"}' } });
    });
    await ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(SPLASH_DURATION_MS + 1000);
    });
    expect(renderer.root.findAllByProps({ testID: 'lock-screen' }).length).toBeGreaterThan(0);
    expect(rendered(renderer)).toContain(t('control.blocked.title'));
    expect(renderer.root.findByType(WebView)).toBeTruthy(); // kept behind it
  } finally {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(allowed()) }),
    );
    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  }
});
