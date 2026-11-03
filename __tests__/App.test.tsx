/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { WebView } from 'react-native-webview';
import App from '../App';
import { ODOO_WEB_URL } from '../src/config';
import { SPLASH_DURATION_MS } from '../src/screens/SplashScreen';

jest.useFakeTimers();

const rendered = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  JSON.stringify(renderer.toJSON());

// The splash renders the ring-less logo asset.
const SPLASH_LOGO = 'maes_logo_mark';

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
