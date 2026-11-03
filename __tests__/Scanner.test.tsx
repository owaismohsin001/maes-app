/**
 * The handheld's scanner feeding Odoo's own Barcode app in the WebView.
 *
 * @format
 */

import React from 'react';
import { BackHandler, Linking, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { WebView } from 'react-native-webview';
import { ODOO_ORIGIN } from '../src/config';
import NativeMaesScanner from '../src/native/NativeMaesScanner';
import * as scannerModule from '../src/scanner/scanner';
import type { CameraPermission } from '../src/scanner/scanner';
import {
  MAX_FAILURES,
  REPEAT_WINDOW_MS,
  RESTART_AFTER_READ_MS,
} from '../src/scanner/useLiveScanning';
import { SCANNER_EXIT_MS } from '../src/components/ScannerOverlay';
import OdooWebViewScreen, {
  LEAVE_BARCODE_FALLBACK_MS,
} from '../src/screens/OdooWebViewScreen';
import {
  BARCODE_RESULT_DELAY_MS,
  BARCODE_RESULT_MESSAGE,
  OPEN_SCANNER_MESSAGE,
  PAGE_URL_MESSAGE,
} from '../src/utils/odooBarcodeScript';

jest.useFakeTimers();

// The shared mock from jest.setup.js, with its test helpers.
type ScannerMock = typeof NativeMaesScanner & {
  [K in
    | 'getStatus'
    | 'prepare'
    | 'startScan'
    | 'stopScan'
    | 'feedback'
    | 'learnScanKey']: jest.Mock;
} & {
  __status: (state: string) => object;
  __emit: (name: 'onScanEvent' | 'onScanKey', value?: object) => void;
  __reset: () => void;
};
const scanner = NativeMaesScanner as ScannerMock;

const ODOO = ODOO_ORIGIN;
const BARCODE_APP = `${ODOO}/odoo/barcode`;

type Handle = { injectJavaScript: jest.Mock; goBack: jest.Mock };
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

const message = (msg: object) =>
  act(() =>
    webViewProps().onMessage({ nativeEvent: { data: JSON.stringify(msg) } }),
  );

const emit = (name: 'onScanEvent' | 'onScanKey', value?: object) =>
  act(() => scanner.__emit(name, value));
const started = () => emit('onScanEvent', { type: 'started', code: '' });
const decoded = (code: string) =>
  emit('onScanEvent', { type: 'decoded', code });
const ended = (type: string) => emit('onScanEvent', { type, code: '' });

const byTestID = (id: string) => renderer.root.findAllByProps({ testID: id });
const shown = (id: string) => byTestID(id).length > 0;
const press = (id: string) => act(() => byTestID(id)[0].props.onPress());

/** All text on screen. */
const rendered = () =>
  renderer.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat().join(''))
    .join('\n');

const injected = () =>
  handle().injectJavaScript.mock.calls.map(c => c[0] as string);

/** The barcode scripts typed into the page: their code and scan id. */
const typed = () =>
  injected()
    .map(script => /\}\)\("((?:[^"\\]|\\.)*)", "([^"]*)"\);\s*true;$/.exec(script))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => ({ code: m[1], id: m[2] }));

/** Odoo's answer (its notification) to the last code typed into the page. */
const answer = (level: string, text: string) => {
  const last = typed().at(-1);
  if (!last) {
    throw new Error('nothing was typed into the page');
  }
  return message({
    type: BARCODE_RESULT_MESSAGE,
    id: last.id,
    level,
    message: text,
  });
};

async function mount() {
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<OdooWebViewScreen />);
  });
  await settle();
}

/** Opens the Barcode app and lets the first read start. */
async function openBarcodeApp() {
  await navigate(BARCODE_APP);
  await started();
}

/** Lets the scanner screen animate away. */
const exitDone = () => advance(SCANNER_EXIT_MS + 50);

beforeEach(async () => {
  scanner.__reset();
  await mount();
});

afterEach(async () => {
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('nothing covers Odoo outside the Barcode app; the scanner is powered up early', async () => {
  expect(shown('scanner-overlay')).toBe(false);
  expect(scanner.prepare).toHaveBeenCalledTimes(1);

  await navigate(`${ODOO}/odoo/inventory`);
  expect(shown('scanner-overlay')).toBe(false);
  expect(scanner.startScan).not.toHaveBeenCalled();
});

test('opening the Barcode app: the scanner screen covers it and reading starts by itself', async () => {
  await navigate(BARCODE_APP);
  expect(shown('scanner-overlay')).toBe(true);
  expect(scanner.startScan).toHaveBeenCalledTimes(1);
  expect(shown('scanner-loading')).toBe(true);

  await started();
  expect(rendered()).toContain('Barcode scanner');
  expect(rendered()).toContain('Scanned codes appear here.');
  expect(injected()).toHaveLength(0); // nothing re-implemented: Odoo's page is the app
});

test('the URL reported by the page counts too (Odoo navigates in-page)', async () => {
  await message({ type: PAGE_URL_MESSAGE, url: `${BARCODE_APP}-operations` });
  expect(shown('scanner-overlay')).toBe(true);
});

test("a read is typed into Odoo's page with a beep; the next read waits for Odoo's answer", async () => {
  await openBarcodeApp();
  await decoded('TEST-0001');

  expect(typed().map(s => s.code)).toEqual(['TEST-0001']);
  expect(scanner.feedback).toHaveBeenCalledTimes(1);
  expect(rendered()).toContain('TEST-0001');
  expect(rendered()).toContain('Sending to Odoo…');

  // Held: no second read while Odoo is still answering.
  await advance(RESTART_AFTER_READ_MS * 4);
  expect(scanner.startScan).toHaveBeenCalledTimes(1);

  await answer('warning', 'No product corresponding to barcode');
  expect(rendered()).toContain('No product corresponding to barcode');
  await advance(RESTART_AFTER_READ_MS);
  expect(scanner.startScan).toHaveBeenCalledTimes(2);
});

test('a read Odoo never answers is given up on, and reading goes on', async () => {
  await openBarcodeApp();
  await decoded('TEST-0001');
  await advance(BARCODE_RESULT_DELAY_MS + 2500);
  expect(rendered()).toContain('Sent to Odoo');

  await advance(RESTART_AFTER_READ_MS);
  expect(scanner.startScan).toHaveBeenCalledTimes(2);
});

test('the same label still under the scanner is not sent again; a new one is', async () => {
  await openBarcodeApp();
  await decoded('TEST-0001');
  await answer('ok', '');
  await advance(RESTART_AFTER_READ_MS);
  await decoded('TEST-0001'); // same label, moments later
  expect(typed()).toHaveLength(1);
  expect(scanner.feedback).toHaveBeenCalledTimes(1);
  await advance(RESTART_AFTER_READ_MS); // a repeat read is not held

  await decoded('TEST-0002');
  expect(typed()).toHaveLength(2);
  await answer('ok', '');
  await advance(RESTART_AFTER_READ_MS);

  // The same code again after a real pause is a second item.
  await advance(REPEAT_WINDOW_MS);
  await decoded('TEST-0002');
  expect(typed()).toHaveLength(3);
});

test('a timeout just starts the next read, without a message', async () => {
  await openBarcodeApp();
  await ended('timeout');
  await advance(0);

  expect(scanner.startScan).toHaveBeenCalledTimes(2);
  expect(shown('scanner-retry')).toBe(false);
});

test('repeated failures stop reading with a message; Try again starts over', async () => {
  await openBarcodeApp();
  for (let i = 0; i < MAX_FAILURES; i++) {
    await ended('error');
    await advance(1000);
  }
  expect(scanner.startScan).toHaveBeenCalledTimes(MAX_FAILURES);
  expect(rendered()).toContain('Scanning failed');

  await press('scanner-retry');
  expect(scanner.startScan).toHaveBeenCalledTimes(MAX_FAILURES + 1);
});

test('Android back leaves the Barcode app: the scanner screen stays until Odoo is out', async () => {
  const addListener = jest.spyOn(BackHandler, 'addEventListener');
  await openBarcodeApp();
  const calls = addListener.mock.calls.filter(
    c => c[0] === 'hardwareBackPress',
  );
  const handler = calls[calls.length - 1][1];
  addListener.mockRestore();

  let consumed: boolean | null | undefined;
  await act(() => {
    consumed = handler({} as Parameters<typeof handler>[0]);
  });
  expect(consumed).toBe(true);
  expect(handle().goBack).toHaveBeenCalledTimes(1);
  expect(scanner.stopScan).toHaveBeenCalledTimes(1);
  // Odoo's own Barcode screen never shows in between.
  await exitDone();
  expect(shown('scanner-overlay')).toBe(true);

  await navigate(`${ODOO}/odoo`); // the apps menu
  await exitDone();
  expect(shown('scanner-overlay')).toBe(false);
});

test("the screen's back button does the same", async () => {
  await openBarcodeApp();
  await press('scanner-back');
  expect(handle().goBack).toHaveBeenCalledTimes(1);

  await navigate(`${ODOO}/odoo`);
  await exitDone();
  expect(shown('scanner-overlay')).toBe(false);
});

test('from deeper in the Barcode app, back keeps stepping back until it is left', async () => {
  await openBarcodeApp();
  await navigate(`${BARCODE_APP}/action-1/2`); // Odoo went deeper underneath
  await press('scanner-back');
  expect(handle().goBack).toHaveBeenCalledTimes(1);

  await navigate(BARCODE_APP);
  expect(handle().goBack).toHaveBeenCalledTimes(2);

  await navigate(`${ODOO}/odoo`);
  await exitDone();
  expect(shown('scanner-overlay')).toBe(false);
  expect(handle().goBack).toHaveBeenCalledTimes(2);
});

test("if history can't leave the Barcode app, Odoo's start page is loaded", async () => {
  await openBarcodeApp();
  await press('scanner-back');
  await advance(LEAVE_BARCODE_FALLBACK_MS);

  expect(injected()).toContain(
    `window.location.assign(${JSON.stringify(`${ODOO}/odoo`)});true;`,
  );
});

test("Odoo's own scan buttons open the scanner screen", async () => {
  await message({ type: OPEN_SCANNER_MESSAGE });
  expect(shown('scanner-overlay')).toBe(true);
  expect(scanner.startScan).toHaveBeenCalledTimes(1);
});

test('leaving the Barcode app closes the scanner screen and stops reading', async () => {
  await openBarcodeApp();
  await navigate(`${ODOO}/odoo`);
  await exitDone();

  expect(shown('scanner-overlay')).toBe(false);
  expect(scanner.stopScan).toHaveBeenCalledTimes(1);
});

test("the side button reads once on Odoo's own screens", async () => {
  await emit('onScanKey');
  expect(scanner.startScan).toHaveBeenCalledTimes(1);

  await decoded('TEST-0003');
  expect(typed().map(s => s.code)).toEqual(['TEST-0003']);
  expect(scanner.feedback).toHaveBeenCalledTimes(1);

  await advance(RESTART_AFTER_READ_MS * 2);
  expect(scanner.startScan).toHaveBeenCalledTimes(1); // no continuous reading here
});

test('reads on the status screen are test scans: shown there, not sent to Odoo', async () => {
  await openBarcodeApp();
  await press('scanner-open-status');

  await decoded('TEST-0004');
  expect(injected()).toHaveLength(0);
  expect(byTestID('scanner-last-code')[0].props.children).toBe('TEST-0004');
  expect(byTestID('scanner-app-version')[0].props.value).toBe('1.4');
});

describe('camera permission on the status screen (Android)', () => {
  let granted: boolean;
  let answerWith: CameraPermission;

  beforeEach(() => {
    granted = false;
    answerWith = 'denied';
    jest
      .spyOn(scannerModule, 'hasCameraPermission')
      .mockImplementation(async () => granted);
    jest
      .spyOn(scannerModule, 'requestCameraPermission')
      .mockImplementation(async () => {
        granted = answerWith === 'granted';
        return answerWith;
      });
  });

  afterEach(() => jest.restoreAllMocks());

  test('Allow asks for it, then the row says Allowed', async () => {
    await openBarcodeApp();
    await press('scanner-open-status');
    expect(shown('scanner-camera-allow')).toBe(true);

    answerWith = 'granted';
    await press('scanner-camera-allow');

    expect(shown('scanner-camera-allow')).toBe(false);
    expect(rendered()).toContain('Allowed');
  });

  test('after "Don\'t ask again" it opens Android settings', async () => {
    const openSettings = jest
      .spyOn(Linking, 'openSettings')
      .mockResolvedValue(undefined);
    answerWith = 'blocked';
    await openBarcodeApp();
    await press('scanner-open-status');

    await press('scanner-camera-allow');
    expect(shown('scanner-camera-allow')).toBe(false);
    await press('scanner-camera-settings');

    expect(openSettings).toHaveBeenCalledTimes(1);
  });
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

  test("Odoo's own Barcode app stays in view: nothing covers it, no read is attempted", async () => {
    await navigate(BARCODE_APP);
    await advance(300);

    expect(shown('scanner-overlay')).toBe(false);
    expect(scanner.prepare).not.toHaveBeenCalled();
    expect(scanner.startScan).not.toHaveBeenCalled();
  });

  test('the side button does not try to scan', async () => {
    await emit('onScanKey');
    expect(scanner.prepare).not.toHaveBeenCalled();
    expect(scanner.startScan).not.toHaveBeenCalled();
  });
});
