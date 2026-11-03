/**
 * @format
 */

import React from 'react';
import { BackHandler, Linking, Text, Vibration } from 'react-native';
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
import { REPLAY_GAP_MS } from '../src/screens/barcode/shared';
import OdooWebViewScreen, {
  LEAVE_BARCODE_FALLBACK_MS,
} from '../src/screens/OdooWebViewScreen';
import {
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
const toastText = () => byTestID('scan-toast-text')[0]?.props.children;

/** All text on screen. */
const rendered = () =>
  renderer.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat().join(''))
    .join('\n');

const injected = () =>
  handle().injectJavaScript.mock.calls.map(c => c[0] as string);

// Odoo, as the app's Barcode screens see it (synthetic answers only).
type RpcCall = { route: string; params: Record<string, unknown> };
let rpcCalls: RpcCall[] = [];
/** Null: Odoo doesn't answer (yet). */
let rpcAnswer: (call: RpcCall) => { result?: unknown; error?: object } | null;

function defaultAnswer({ route }: RpcCall) {
  if (route === '/web/session/get_session_info') {
    return {
      result: { uid: 7, name: 'Test User', user_context: { lang: 'en_US' } },
    };
  }
  if (route === '/stock_barcode/get_main_menu_data') {
    return {
      result: {
        groups: { locations: true, package: false, tracking: false },
        quant_count: 0,
      },
    };
  }
  if (route === '/stock_barcode/scan_from_main_menu') {
    return {
      result: { warning: 'No picking or product corresponding to barcode' },
    };
  }
  return { result: [] }; // search_read: nothing found
}

const scansSentToMenu = () =>
  rpcCalls.filter(c => c.route === '/stock_barcode/scan_from_main_menu');

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
  rpcCalls = [];
  rpcAnswer = defaultAnswer;
  (globalThis as { fetch: unknown }).fetch = jest.fn(
    async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      const call = {
        route: url
          .slice(ODOO.length)
          .replace(/\/web\/dataset\/call_kw\/.*/, '/web/dataset/call_kw'),
        params: body.params,
      };
      rpcCalls.push(call);
      const answer = rpcAnswer(call);
      if (!answer) {
        return new Promise(() => {});
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ jsonrpc: '2.0', id: body.id, ...answer }),
      };
    },
  );
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

test("opening the Barcode app: the app's own menu, and reading starts by itself", async () => {
  await navigate(BARCODE_APP);
  expect(shown('scanner-overlay')).toBe(true);
  expect(scanner.startScan).toHaveBeenCalledTimes(1);

  await started();
  expect(shown('barcode-menu')).toBe(true);
  expect(rendered()).not.toContain('Test User'); // no user name in the header
  // The scanner tab first: the scanner's picture; manual entry in the header.
  expect(shown('scan-window')).toBe(true);
  expect(shown('header-manual')).toBe(true);
  expect(rendered()).not.toContain('Add inventory');

  await press('segment-menu');
  expect(rendered()).toContain('Add inventory');
  expect(rendered()).toContain('Deliveries');
  expect(rendered()).toContain('Count inventory');
  expect(shown('scan-window')).toBe(false);
});

test('the URL reported by the page counts too (Odoo navigates in-page)', async () => {
  await message({ type: PAGE_URL_MESSAGE, url: `${BARCODE_APP}-operations` });
  expect(shown('scanner-overlay')).toBe(true);
});

test('a read goes to the native screen with a beep, not into the page; the next read starts', async () => {
  await openBarcodeApp();
  await decoded('TEST-0001');

  expect(injected()).toHaveLength(0);
  expect(scanner.feedback).toHaveBeenCalledTimes(1);
  expect(scansSentToMenu().map(c => c.params.barcode)).toEqual(['TEST-0001']);
  // Not a transfer etc., and no product has it as internal reference either.
  expect(rpcCalls.some(c => c.route === '/web/dataset/call_kw')).toBe(true);
  expect(rendered()).toContain(
    'No picking or product corresponding to barcode',
  );

  expect(scanner.startScan).toHaveBeenCalledTimes(1);
  await advance(RESTART_AFTER_READ_MS);
  expect(scanner.startScan).toHaveBeenCalledTimes(2);
});

/** Odoo with one open delivery, TEST/OUT/00005: 2 × Test siren. */
function pickingAnswer(call: RpcCall) {
  if (call.route === '/stock_barcode/scan_from_main_menu') {
    return {
      result: {
        action: {
          type: 'ir.actions.client',
          res_model: 'stock.picking',
          context: { active_id: 5 },
        },
      },
    };
  }
  if (call.route === '/stock_barcode/get_barcode_data') {
    return {
      result: {
        data: {
          records: {
            'stock.picking': [
              {
                id: 5,
                name: 'TEST/OUT/00005',
                state: 'assigned',
                picking_type_code: 'outgoing',
                location_id: 1,
                location_dest_id: 2,
                note: false,
                partner_id: false,
                return_id: false,
              },
            ],
            'stock.move': [
              { id: 9, product_id: 3, product_uom_qty: 2, move_line_ids: [] },
            ],
            'stock.move.line': [],
            'product.product': [
              {
                id: 3,
                display_name: 'Test siren',
                default_code: 'TS-1',
                barcode: '9990000000003',
                tracking: 'none',
                uom_id: 1,
                is_storable: true,
              },
            ],
          },
          config: {},
          source_location_ids: [1],
          destination_locations_ids: [2],
        },
        groups: {},
      },
    };
  }
  return defaultAnswer(call);
}

test('a scanned transfer opens in the native transfer screen', async () => {
  rpcAnswer = pickingAnswer;
  await openBarcodeApp();
  await decoded('TEST/OUT/00005');
  await advance(300);

  expect(shown('barcode-picking')).toBe(true);
  expect(rendered()).toContain('TEST/OUT/00005');
  expect(rendered()).toContain('Test siren');

  // Scanning the product counts it, right away on screen.
  await advance(RESTART_AFTER_READ_MS);
  await decoded('9990000000003');
  expect(byTestID('line-3-qty')[0].props.children[0]).toBe('1');
});

test('the home tab chosen is still there after another screen', async () => {
  rpcAnswer = pickingAnswer;
  await openBarcodeApp();
  await press('segment-menu');
  await decoded('TEST/OUT/00005');
  await advance(300);
  expect(shown('barcode-picking')).toBe(true);

  await press('header-back');
  await advance(300);
  expect(shown('barcode-menu')).toBe(true);
  expect(rendered()).toContain('Add inventory');
  expect(shown('scan-window')).toBe(false);
});

test('the menu tab counts the work waiting', async () => {
  rpcAnswer = call =>
    call.route === '/stock_barcode/get_main_menu_data'
      ? {
          result: {
            groups: { locations: true, package: false, tracking: false },
            quant_count: 4,
          },
        }
      : defaultAnswer(call);
  await openBarcodeApp();
  expect(byTestID('segment-menu-count')[0]).toBeDefined();
  expect(rendered()).toContain('4');
});

test("the header's keyboard button types a code instead of scanning", async () => {
  await openBarcodeApp();
  await press('header-manual');
  await act(() => byTestID('manual-input')[0].props.onChangeText('TEST-0002'));
  await press('manual-submit');
  await advance(300);
  expect(scansSentToMenu()).toHaveLength(1);
});

test('a signed-out session offers to sign in again in the web client', async () => {
  rpcAnswer = () => ({
    error: {
      code: 100,
      message: 'Session expired',
      data: {
        name: 'odoo.http.SessionExpiredException',
        message: 'Session expired',
      },
    },
  });
  await openBarcodeApp();
  expect(rendered()).toContain('Signed out');
  await press('state-action');
  expect(injected()[0]).toContain('/web/login?redirect=%2Fodoo%2Fbarcode');
});

test('the same label still under the scanner is not sent again; a new one is', async () => {
  await openBarcodeApp();
  await decoded('TEST-0001');
  await advance(RESTART_AFTER_READ_MS);
  await decoded('TEST-0001'); // same label, moments later
  expect(scansSentToMenu()).toHaveLength(1);
  expect(scanner.feedback).toHaveBeenCalledTimes(1);

  await advance(RESTART_AFTER_READ_MS);
  await decoded('TEST-0002');
  expect(scansSentToMenu()).toHaveLength(2);

  // The same code again after a real pause is a second item.
  await advance(REPEAT_WINDOW_MS);
  await decoded('TEST-0002');
  expect(scansSentToMenu()).toHaveLength(3);
});

test('the same label read again shows its answer again, without counting it twice', async () => {
  // The line saves stay underway: only the scans' answers show.
  rpcAnswer = call =>
    call.route === '/stock_barcode/save_barcode_data'
      ? null
      : pickingAnswer(call);
  await openBarcodeApp();
  await decoded('TEST/OUT/00005');
  await advance(300);
  await advance(RESTART_AFTER_READ_MS);
  await decoded('9990000000003');
  expect(toastText()).toBe('+1 Test siren');

  // Held under the scanner: read again moments later, then once more.
  await advance(RESTART_AFTER_READ_MS);
  await decoded('9990000000003');
  await advance(REPLAY_GAP_MS - RESTART_AFTER_READ_MS);
  await decoded('9990000000003');
  expect(toastText()).toBe('Already scanned: +1 Test siren');
  expect(byTestID('line-3-qty')[0].props.children[0]).toBe('1');
  expect(scanner.feedback).toHaveBeenCalledTimes(2); // transfer + product only
});

test('a rejected label read again shows the rejection again, with a buzz', async () => {
  const vibrate = jest.spyOn(Vibration, 'vibrate');
  vibrate.mockClear();
  await openBarcodeApp();
  await decoded('TEST-0001');
  const rejection = 'No picking or product corresponding to barcode';
  expect(toastText()).toBe(rejection);
  expect(vibrate).toHaveBeenCalledTimes(1);

  await advance(REPLAY_GAP_MS);
  await decoded('TEST-0001');
  expect(scansSentToMenu()).toHaveLength(1);
  expect(toastText()).toBe(rejection);
  expect(vibrate).toHaveBeenCalledTimes(2);
  vibrate.mockRestore();
});

test('a timeout just starts the next read, without a message', async () => {
  await openBarcodeApp();
  await ended('timeout');
  await advance(0);

  expect(scanner.startScan).toHaveBeenCalledTimes(2);
  expect(shown('scan-window-retry')).toBe(false);
});

test('repeated failures stop reading with a message; Try again starts over', async () => {
  await openBarcodeApp();
  for (let i = 0; i < MAX_FAILURES; i++) {
    await ended('error');
    await advance(1000);
  }
  expect(scanner.startScan).toHaveBeenCalledTimes(MAX_FAILURES);
  expect(rendered()).toContain('Scanning failed');

  await press('scan-window-retry');
  expect(scanner.startScan).toHaveBeenCalledTimes(MAX_FAILURES + 1);
});

test('outside the scanner tab, a stopped scanner shows a notice with Try again', async () => {
  await openBarcodeApp();
  for (let i = 0; i < MAX_FAILURES; i++) {
    await ended('error');
    await advance(1000);
  }
  expect(shown('scan-problem')).toBe(false); // the scanner tab shows it itself

  await press('segment-menu');
  expect(byTestID('scan-problem-text')[0].props.children).toContain(
    'Scanning failed',
  );
  await press('scan-problem-retry');
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

test("the menu's back button does the same", async () => {
  await openBarcodeApp();
  await press('header-back');
  expect(handle().goBack).toHaveBeenCalledTimes(1);

  await navigate(`${ODOO}/odoo`);
  await exitDone();
  expect(shown('scanner-overlay')).toBe(false);
});

test('from deeper in the Barcode app, back keeps stepping back until it is left', async () => {
  await openBarcodeApp();
  await navigate(`${BARCODE_APP}/action-1/2`); // Odoo went deeper underneath
  await press('header-back');
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
  await press('header-back');
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
  expect(injected()[0]).toContain('"TEST-0003"');
  expect(scanner.feedback).toHaveBeenCalledTimes(1);

  await advance(RESTART_AFTER_READ_MS * 2);
  expect(scanner.startScan).toHaveBeenCalledTimes(1); // no continuous reading here
});

test('reads on the status screen are test scans: shown there, not sent to Odoo', async () => {
  await openBarcodeApp();
  await press('menu-status');

  await decoded('TEST-0004');
  expect(injected()).toHaveLength(0);
  expect(byTestID('scanner-last-code')[0].props.children).toBe('TEST-0004');
});

describe('camera permission on the status screen (Android)', () => {
  let granted: boolean;
  let answer: CameraPermission;

  beforeEach(() => {
    granted = false;
    answer = 'denied';
    jest
      .spyOn(scannerModule, 'hasCameraPermission')
      .mockImplementation(async () => granted);
    jest
      .spyOn(scannerModule, 'requestCameraPermission')
      .mockImplementation(async () => {
        granted = answer === 'granted';
        return answer;
      });
  });

  afterEach(() => jest.restoreAllMocks());

  test('Allow asks for it, then the row says Allowed', async () => {
    await openBarcodeApp();
    await press('menu-status');
    expect(shown('scanner-camera-allow')).toBe(true);

    answer = 'granted';
    await press('scanner-camera-allow');

    expect(shown('scanner-camera-allow')).toBe(false);
    expect(rendered()).toContain('Allowed');
  });

  test('after "Don\'t ask again" it opens Android settings', async () => {
    const openSettings = jest
      .spyOn(Linking, 'openSettings')
      .mockResolvedValue(undefined);
    answer = 'blocked';
    await openBarcodeApp();
    await press('menu-status');

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

  test('the status screen never asks for the camera', async () => {
    const request = jest.spyOn(scannerModule, 'requestCameraPermission');
    jest.spyOn(scannerModule, 'hasCameraPermission').mockResolvedValue(false);
    await navigate(BARCODE_APP);
    await press('menu-status');

    expect(shown('scanner-camera-allow')).toBe(false);
    expect(rendered()).toContain('Not allowed');
    expect(request).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  test('the screens say to type codes, and no read is attempted', async () => {
    await navigate(BARCODE_APP);
    await advance(300);

    // Nothing to see on the scanner tab here: the menu opens first.
    expect(shown('barcode-menu')).toBe(true);
    expect(rendered()).toContain('Add inventory');
    await press('segment-scanner');
    expect(rendered()).toContain('No scanner connected');
    expect(scanner.prepare).not.toHaveBeenCalled();
    expect(scanner.startScan).not.toHaveBeenCalled();
  });

  test('the side button does not try to scan', async () => {
    await emit('onScanKey');
    expect(scanner.prepare).not.toHaveBeenCalled();
    expect(scanner.startScan).not.toHaveBeenCalled();
  });
});
