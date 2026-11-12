/**
 * The handheld's CM60 scanner typing into Odoo's own pages (v1.6): the app is
 * the WebView and nothing else; a read is typed into the page as real key
 * presses, like a keyboard-wedge scanner, with the page script as fallback.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { WebView } from 'react-native-webview';
import { ODOO_ORIGIN } from '../src/config';
import NativeMaesScanner from '../src/native/NativeMaesScanner';
import OdooWebViewScreen from '../src/screens/OdooWebViewScreen';

jest.useFakeTimers();

// The shared mock from jest.setup.js, with its test helpers.
type ScannerMock = typeof NativeMaesScanner & {
  [K in
    | 'getStatus'
    | 'prepare'
    | 'startScan'
    | 'stopScan'
    | 'feedback'
    | 'typeText'
    | 'learnScanKey']: jest.Mock;
} & {
  __status: (state: string) => object;
  __emit: (name: 'onScanEvent' | 'onScanKey', value?: object) => void;
  __reset: () => void;
};
const scanner = NativeMaesScanner as ScannerMock;

const ODOO = ODOO_ORIGIN;
const BARCODE_APP = `${ODOO}/odoo/barcode`;

type Handle = { injectJavaScript: jest.Mock };
const handle = () => (WebView as unknown as { lastHandle: Handle }).lastHandle;

let renderer: ReactTestRenderer.ReactTestRenderer;

/** Lets the hooks' promise chains (status, permission, prepare) settle. */
async function settle() {
  for (let i = 0; i < 5; i++) {
    await ReactTestRenderer.act(async () => {});
  }
}

async function act(fn: () => void) {
  await ReactTestRenderer.act(async () => {
    fn();
  });
  await settle();
}

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

const webViewProps = () => renderer.root.findByType(WebView).props;

/** Odoo navigating in-page, as Android reports it. */
const navigate = (url: string) =>
  act(() => webViewProps().onNavigationStateChange({ url, canGoBack: false }));

const emit = (name: 'onScanEvent' | 'onScanKey', value?: object) =>
  act(() => scanner.__emit(name, value));
const started = () => emit('onScanEvent', { type: 'started', code: '' });
const decoded = (code: string) =>
  emit('onScanEvent', { type: 'decoded', code });
const ended = (type: string) => emit('onScanEvent', { type, code: '' });

const byTestID = (id: string) => renderer.root.findAllByProps({ testID: id });
const shown = (id: string) => byTestID(id).length > 0;
const injected = () =>
  handle().injectJavaScript.mock.calls.map(c => c[0] as string);

/** Codes typed into the page as real key presses (`typeText`). */
const keyTyped = () => scanner.typeText.mock.calls.map(c => c[0] as string);

/** Codes sent through the fallback page script (`odooBarcodeScript`). */
const scriptTyped = () =>
  injected()
    .map(script =>
      /\}\)\("((?:[^"\\]|\\.)*)", "([^"]*)"\);\s*true;$/.exec(script),
    )
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => m[1]);

async function mount() {
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<OdooWebViewScreen />);
  });
  await settle();
}

/** The handheld's scan button: one press, one read. */
const scanKey = async () => {
  await emit('onScanKey');
  await started();
};

/** Only the WebView: nothing of the app is drawn over Odoo. */
const nothingOverOdoo = () =>
  !shown('scanner-settings') && !shown('scanner-overlay');

beforeEach(async () => {
  scanner.__reset();
  await mount();
});

afterEach(async () => {
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('nothing covers Odoo, in the Barcode app either; the scanner is powered up early', async () => {
  expect(nothingOverOdoo()).toBe(true);
  expect(scanner.prepare).toHaveBeenCalledTimes(1);

  await navigate(BARCODE_APP);
  await advance(10000);
  expect(nothingOverOdoo()).toBe(true);
  expect(scanner.startScan).not.toHaveBeenCalled(); // no continuous reading
});

test("one press: one read, typed into Odoo's page as key presses, with a beep", async () => {
  await navigate(BARCODE_APP);
  await scanKey();
  expect(scanner.startScan).toHaveBeenCalledTimes(1);

  await decoded('TEST-0001');
  expect(keyTyped()).toEqual(['TEST-0001']);
  expect(scriptTyped()).toEqual([]); // not the fallback
  expect(scanner.feedback).toHaveBeenCalledTimes(1);
  expect(nothingOverOdoo()).toBe(true);

  // No next read by itself: only another press.
  await advance(10000);
  expect(scanner.startScan).toHaveBeenCalledTimes(1);
});

test('when the key presses cannot be sent, the code goes in through the page script', async () => {
  scanner.typeText.mockImplementation(() => Promise.resolve(false));
  await scanKey();
  await decoded('TEST-0002');
  expect(scriptTyped()).toEqual(['TEST-0002']);

  scanner.typeText.mockImplementation(() => Promise.reject(new Error('x')));
  await scanKey();
  await decoded('TEST-0003');
  expect(scriptTyped()).toEqual(['TEST-0002', 'TEST-0003']);
});

test('each press is one scan — the same label pressed again counts again', async () => {
  await scanKey();
  await decoded('TEST-0001');
  await scanKey();
  await decoded('TEST-0001');

  expect(keyTyped()).toEqual(['TEST-0001', 'TEST-0001']);
  expect(scanner.feedback).toHaveBeenCalledTimes(2);
});

test('a press that finds nothing just ends: no new read, nothing typed', async () => {
  await scanKey();
  await ended('timeout');
  await advance(10000);

  expect(scanner.startScan).toHaveBeenCalledTimes(1);
  expect(keyTyped()).toEqual([]);
  expect(nothingOverOdoo()).toBe(true);

  await scanKey(); // the next press reads again
  expect(scanner.startScan).toHaveBeenCalledTimes(2);
});

describe('on a phone without the built-in scanner', () => {
  beforeEach(async () => {
    await ReactTestRenderer.act(async () => renderer.unmount());
    scanner.__reset();
    scanner.getStatus.mockImplementation(() =>
      Promise.resolve(scanner.__status('unavailable')),
    );
    await mount();
  });

  test("Odoo's own Barcode app stays Odoo's: no read is attempted", async () => {
    await navigate(BARCODE_APP);
    await advance(300);
    expect(nothingOverOdoo()).toBe(true);
    expect(scanner.prepare).not.toHaveBeenCalled();
    expect(scanner.startScan).not.toHaveBeenCalled();
  });

  test('the side button does not try to scan', async () => {
    await emit('onScanKey');
    expect(scanner.prepare).not.toHaveBeenCalled();
    expect(scanner.startScan).not.toHaveBeenCalled();
  });
});

describe('while the app is locked (app control)', () => {
  beforeEach(async () => {
    await ReactTestRenderer.act(async () => renderer.unmount());
    scanner.__reset();
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <OdooWebViewScreen scanEnabled={false} />,
      );
    });
    await settle();
  });

  test('a read is dropped: nothing typed into the hidden page, no beep', async () => {
    await navigate(BARCODE_APP);
    await scanKey();
    await decoded('TEST-0001');
    expect(keyTyped()).toEqual([]);
    expect(scriptTyped()).toEqual([]);
    expect(scanner.feedback).not.toHaveBeenCalled();
  });
});
