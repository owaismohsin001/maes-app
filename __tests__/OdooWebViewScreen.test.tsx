/**
 * @format
 */

import React from 'react';
import { BackHandler, Linking, StatusBar, StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { WebView } from 'react-native-webview';
import { ODOO_ORIGIN, ODOO_WEB_URL } from '../src/config';
import {
  BACK_WATCHDOG_MS,
  EXIT_CONFIRM_WINDOW_MS,
} from '../src/hooks/useWebViewBackHandler';
import OdooWebViewScreen from '../src/screens/OdooWebViewScreen';
import {
  ODOO_PAGE_SCRIPT,
  PAGE_COLORS_MESSAGE,
  PAGE_HISTORY_MESSAGE,
  PAGE_READY_MESSAGE,
} from '../src/utils/odooPageScript';

jest.useFakeTimers();

const ODOO = ODOO_ORIGIN;

type Handle = Record<
  'goBack' | 'reload' | 'injectJavaScript' | 'clearHistory',
  jest.Mock
>;
const handle = () => (WebView as unknown as { lastHandle: Handle }).lastHandle;

let renderer: ReactTestRenderer.ReactTestRenderer;
let pressBack: () => boolean | null | undefined;

let onReady: jest.Mock;

beforeEach(async () => {
  onReady = jest.fn();
  const addListener = jest.spyOn(BackHandler, 'addEventListener');
  // Async act: the scanner overlay asks the (mocked) native scanner for its status on mount.
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <OdooWebViewScreen onReady={onReady} />,
    );
  });
  const call = addListener.mock.calls.find(c => c[0] === 'hardwareBackPress');
  const handler = call![1];
  pressBack = () => handler({} as Parameters<typeof handler>[0]);
  addListener.mockRestore();
});

afterEach(async () => {
  await ReactTestRenderer.act(() => renderer.unmount());
});

const webViewProps = () => renderer.root.findByType(WebView).props;

/** Native "page finished" event: its canGoBack is reliable. */
async function loaded(url: string, canGoBack = false) {
  await ReactTestRenderer.act(() => {
    webViewProps().onLoad({ nativeEvent: { url, canGoBack } });
  });
}

/** Android's navigation-start event: canGoBack is stale (pre-commit). */
async function navigationStarted(url: string, staleCanGoBack: boolean) {
  await ReactTestRenderer.act(() => {
    webViewProps().onNavigationStateChange({ url, canGoBack: staleCanGoBack });
  });
}

/** The page script's Navigation API report. */
async function pageHistory(canGoBack: boolean) {
  await message(JSON.stringify({ type: PAGE_HISTORY_MESSAGE, canGoBack }));
}

async function message(data: string) {
  await ReactTestRenderer.act(() => {
    webViewProps().onMessage({ nativeEvent: { data } });
  });
}

test('opens the Odoo backend, hiding the website footer early and after load', () => {
  expect(ODOO_WEB_URL).toBe(`${ODOO_ORIGIN}/odoo`);
  expect(webViewProps().source).toEqual({ uri: ODOO_WEB_URL });
  // Only the general page script: nothing scanner-related is put in the page.
  expect(webViewProps().injectedJavaScriptBeforeContentLoaded).toBe(
    ODOO_PAGE_SCRIPT,
  );
  expect(webViewProps().injectedJavaScript).toBe(ODOO_PAGE_SCRIPT);
});

test('back after a full page load goes to the previous page', async () => {
  await loaded(`${ODOO}/web/reset_password`, true);

  expect(pressBack()).toBe(true);
  expect(handle().goBack).toHaveBeenCalledTimes(1);
});

test("back inside Odoo works although Android's start event says canGoBack=false", async () => {
  // Real sequence on the phone: home loaded, then the Apps screen via pushState.
  await loaded(`${ODOO}/odoo`, false);
  await navigationStarted(`${ODOO}/odoo/apps`, false); // stale
  await pageHistory(true); // the page knows better

  expect(pressBack()).toBe(true);
  expect(handle().goBack).toHaveBeenCalledTimes(1);
});

test('on the first page, only a second press within the window closes the app', async () => {
  await loaded(`${ODOO}/odoo`, false);
  await pageHistory(false);

  expect(pressBack()).toBe(true); // first press: hint only
  expect(pressBack()).toBe(false); // second press: Android closes the app
  expect(handle().goBack).not.toHaveBeenCalled();

  jest.advanceTimersByTime(EXIT_CONFIRM_WINDOW_MS + 1);
  expect(pressBack()).toBe(true); // too late: counts as a first press again
});

test('a back that goes nowhere counts as a press on the first page', async () => {
  await loaded(`${ODOO}/odoo`, true); // wrong: there is nothing to go back to

  expect(pressBack()).toBe(true);
  expect(handle().goBack).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(BACK_WATCHDOG_MS + 1); // nothing navigated → hint shown

  expect(pressBack()).toBe(false); // so the next press closes the app
  expect(handle().goBack).toHaveBeenCalledTimes(1);
});

test('a back that does navigate is not mistaken for the first page', async () => {
  await loaded(`${ODOO}/odoo`, false);
  await pageHistory(true);

  expect(pressBack()).toBe(true);
  await pageHistory(false); // arrived on the first page
  jest.advanceTimersByTime(BACK_WATCHDOG_MS + 1);

  expect(pressBack()).toBe(true); // first press on the first page: hint only
});

test('signing in clears the history, so back never returns to the login form', async () => {
  await loaded(`${ODOO}/web/login`, false);
  await pageHistory(false);
  await loaded(`${ODOO}/odoo`, true);

  expect(handle().clearHistory).toHaveBeenCalledTimes(1);
  expect(pressBack()).toBe(true);
  expect(handle().goBack).not.toHaveBeenCalled();
});

test('moving between Odoo screens keeps the history', async () => {
  await loaded(`${ODOO}/odoo`);
  await loaded(`${ODOO}/odoo/contacts`, true);

  expect(handle().clearHistory).not.toHaveBeenCalled();
});

test('new-window links: Odoo pages stay in the app, others open outside', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

  await ReactTestRenderer.act(() => {
    webViewProps().onOpenWindow({
      nativeEvent: { targetUrl: `${ODOO}/report/pdf/x/1` },
    });
  });
  expect(handle().injectJavaScript).toHaveBeenCalledWith(
    `window.location.assign(${JSON.stringify(`${ODOO}/report/pdf/x/1`)});true;`,
  );
  expect(openURL).not.toHaveBeenCalled();

  await ReactTestRenderer.act(() => {
    webViewProps().onOpenWindow({
      nativeEvent: { targetUrl: 'https://example.com/' },
    });
  });
  expect(openURL).toHaveBeenCalledWith('https://example.com/');

  openURL.mockRestore();
});

const inset = (id: string) =>
  StyleSheet.flatten(renderer.root.findByProps({ testID: id }).props.style)
    .backgroundColor;
const barStyle = () => renderer.root.findByType(StatusBar).props.barStyle;

test('status bar and navigation bar areas follow the page colours', async () => {
  // Before the page reports anything: the app theme (light in tests).
  expect(inset('top-inset')).toBe('#FFFFFF');
  expect(barStyle()).toBe('dark-content');

  await message(
    JSON.stringify({
      type: PAGE_COLORS_MESSAGE,
      top: 'rgb(0, 5, 17)',
      bottom: 'rgb(240, 240, 240)',
    }),
  );
  expect(inset('top-inset')).toBe('rgb(0, 5, 17)');
  expect(inset('bottom-inset')).toBe('rgb(240, 240, 240)');
  expect(barStyle()).toBe('light-content'); // light icons on a dark page

  // Anything else from the page is ignored.
  await message('{"type":"other","top":"red"}');
  await message(
    JSON.stringify({ type: PAGE_COLORS_MESSAGE, top: 'red', bottom: 'blue' }),
  );
  await message('not json');
  expect(inset('top-inset')).toBe('rgb(0, 5, 17)');

  // A load error falls back to the theme.
  await ReactTestRenderer.act(() => {
    webViewProps().onError({ nativeEvent: {} });
  });
  expect(inset('top-inset')).toBe('#FFFFFF');
});

test('reports ready once, when the page says it is ready', async () => {
  await message('{"type":"maes:page-ready"}');
  await message(JSON.stringify({ type: PAGE_READY_MESSAGE }));
  expect(onReady).toHaveBeenCalledTimes(1);
});

test('a failed first load is ready right away (the error screen shows)', async () => {
  await ReactTestRenderer.act(() => {
    webViewProps().onError({ nativeEvent: {} });
  });
  expect(onReady).toHaveBeenCalledTimes(1);
});

test('falls back to ready a few seconds after load if the page stays silent', async () => {
  await ReactTestRenderer.act(() => {
    webViewProps().onLoadEnd({ nativeEvent: {} });
  });
  expect(onReady).not.toHaveBeenCalled();
  await ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(6000);
  });
  expect(onReady).toHaveBeenCalledTimes(1);
});
