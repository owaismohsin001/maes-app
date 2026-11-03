/**
 * @format
 */

import { ODOO_ORIGIN } from '../src/config';
import {
  ODOO_APP_CSS,
  ODOO_APP_STYLE_ID,
  ODOO_PAGE_SCRIPT,
  PAGE_COLORS_MESSAGE,
  PAGE_HISTORY_MESSAGE,
  PAGE_READY_MESSAGE,
  isLightColor,
  isPageReadyMessage,
  parsePageColorsMessage,
  parsePageHistoryMessage,
} from '../src/utils/odooPageScript';
import { hostOf } from '../src/utils/odooUrl';

jest.useFakeTimers();

type FakeElement = {
  nodeType: number;
  id: string;
  textContent: string;
  parentElement: FakeElement | null;
  bg: string;
};

type FakeNavigation = {
  canGoBack: boolean;
  addEventListener: (type: string, fn: () => void) => void;
  fire?: () => void;
};

const fakeNavigation = (canGoBack: boolean): FakeNavigation => {
  const nav: FakeNavigation = {
    canGoBack,
    addEventListener: (type, fn) => {
      if (type === 'currententrychange') {
        nav.fire = fn;
      }
    },
  };
  return nav;
};

const el = (bg: string, parentElement: FakeElement | null = null) => ({
  nodeType: 1,
  id: '',
  textContent: '',
  parentElement,
  bg,
});

/** Runs the page script twice against a minimal fake page. */
function runOn(
  hostname: string,
  opts: {
    hasHead: boolean;
    webClientRenderedAfterMs?: number;
    navigation?: FakeNavigation;
  },
) {
  const appended: FakeElement[] = [];
  const posted: string[] = [];
  const parent = { appendChild: (e: FakeElement) => appended.push(e) };
  // Dark navbar on a transparent child at the top; light body at the bottom.
  const body = el('rgb(250, 250, 250)');
  const navbar = el('rgb(0, 5, 17)', body);
  const navIcon = el('rgba(0, 0, 0, 0)', navbar);
  const window = {
    innerHeight: 800,
    ReactNativeWebView: { postMessage: (m: string) => posted.push(m) },
    navigation: opts.navigation,
  } as Record<string, unknown>;
  const document = {
    hidden: false,
    body,
    head: opts.hasHead ? parent : null,
    documentElement: parent,
    createElement: () => el(''),
    getElementById: (id: string) => appended.find(e => e.id === id) ?? null,
    elementFromPoint: (_x: number, y: number) => (y === 0 ? navIcon : body),
    addEventListener: () => {},
    readyState: 'complete',
    // Without `webClientRenderedAfterMs` this is a plain page (no web client).
    querySelector: (sel: string) => {
      if (opts.webClientRenderedAfterMs === undefined) {
        return null;
      }
      if (sel === '.o_web_client') {
        return body;
      }
      return Date.now() - startedAt >= opts.webClientRenderedAfterMs
        ? body
        : null;
    },
  };
  const startedAt = Date.now();
  const getComputedStyle = (e: FakeElement) => ({ backgroundColor: e.bg });

  // Executing the script string is the point: it is what the WebView runs.
  // eslint-disable-next-line no-new-func
  const run = new Function(
    'window',
    'document',
    'location',
    'getComputedStyle',
    'setInterval',
    'clearInterval',
    ODOO_PAGE_SCRIPT,
  );
  const args = [
    window,
    document,
    { hostname },
    getComputedStyle,
    setInterval,
    clearInterval,
  ];
  run(...args);
  run(...args); // the after-load run must not install twice in one document
  jest.advanceTimersByTime(1000);
  return { appended, posted };
}

const ODOO_HOST = hostOf(ODOO_ORIGIN)!;

test('hides the website footer', () => {
  expect(ODOO_APP_CSS).toContain('footer#bottom');
  expect(ODOO_APP_CSS).toContain('display: none');
});

test('adds the style once on the Odoo host, also before <head> exists', () => {
  for (const hasHead of [true, false]) {
    const { appended } = runOn(ODOO_HOST, { hasHead });
    expect(appended.map(e => [e.id, e.textContent])).toEqual([
      [ODOO_APP_STYLE_ID, ODOO_APP_CSS],
    ]);
  }
});

test('leaves the CSS off other sites', () => {
  expect(runOn('example.com', { hasHead: true }).appended).toEqual([]);
});

const types = (posted: string[]) => posted.map(m => JSON.parse(m).type);

test('reports the edge colours once while they stay the same, then ready', () => {
  const { posted } = runOn(ODOO_HOST, { hasHead: true });
  expect(types(posted)).toEqual([PAGE_COLORS_MESSAGE, PAGE_READY_MESSAGE]);
  expect(isPageReadyMessage(posted[1])).toBe(true);
  expect(parsePageColorsMessage(posted[0])).toEqual({
    top: 'rgb(0, 5, 17)', // walked up past the transparent icon
    bottom: 'rgb(250, 250, 250)',
  });
});

test('parsePageColorsMessage accepts only well-formed colour messages', () => {
  const msg = (o: object) =>
    parsePageColorsMessage(JSON.stringify({ type: PAGE_COLORS_MESSAGE, ...o }));
  expect(msg({ top: 'rgb(1, 2, 3)', bottom: 'rgb(4, 5, 6)' })).toEqual({
    top: 'rgb(1, 2, 3)',
    bottom: 'rgb(4, 5, 6)',
  });
  expect(msg({ top: 'rgb(1, 2, 300)', bottom: 'rgb(4, 5, 6)' })).toBeNull();
  expect(msg({ top: 'red', bottom: 'rgb(4, 5, 6)' })).toBeNull();
  expect(msg({ top: 'rgb(1, 2, 3)' })).toBeNull();
  expect(parsePageColorsMessage('nope')).toBeNull();
});

test('isLightColor picks the readable icon colour', () => {
  expect(isLightColor('rgb(255, 255, 255)')).toBe(true);
  expect(isLightColor('#FFFFFF')).toBe(true);
  expect(isLightColor('rgb(0, 5, 17)')).toBe(false);
  expect(isLightColor('#070B14')).toBe(false);
  expect(isLightColor('rgb(113, 75, 103)')).toBe(false); // Odoo purple
});

test('a run in an earlier document does not stop the next document', () => {
  // Same window, new document: the after-load run must install again.
  const appended: string[] = [];
  const makeDoc = () => ({
    hidden: true,
    body: null,
    head: { appendChild: (e: { id: string }) => appended.push(e.id) },
    documentElement: null,
    createElement: () => ({ id: '', textContent: '' }),
    getElementById: () => null as unknown,
    addEventListener: () => {},
  });
  // eslint-disable-next-line no-new-func
  const run = new Function(
    'window',
    'document',
    'location',
    'setInterval',
    'clearInterval',
    ODOO_PAGE_SCRIPT,
  );
  const window = {};
  const location = { hostname: ODOO_HOST };
  run(window, makeDoc(), location, setInterval, clearInterval);
  run(window, makeDoc(), location, setInterval, clearInterval);
  expect(appended.filter(id => id === ODOO_APP_STYLE_ID).length).toBe(2);
});

test('the Odoo web client is ready only once it rendered its first screen', () => {
  // runOn advances 1 s: rendered after 600 ms → ready; after 3 s → not yet.
  expect(
    types(
      runOn(ODOO_HOST, { hasHead: true, webClientRenderedAfterMs: 600 }).posted,
    ),
  ).toContain(PAGE_READY_MESSAGE);
  expect(
    types(
      runOn(ODOO_HOST, { hasHead: true, webClientRenderedAfterMs: 3000 })
        .posted,
    ),
  ).not.toContain(PAGE_READY_MESSAGE);
});

test('isPageReadyMessage', () => {
  expect(isPageReadyMessage(JSON.stringify({ type: PAGE_READY_MESSAGE }))).toBe(
    true,
  );
  expect(isPageReadyMessage('{"type":"other"}')).toBe(false);
  expect(isPageReadyMessage('nope')).toBe(false);
});

test('reports the history position at start and on every entry change', () => {
  const navigation = fakeNavigation(false);
  const { posted } = runOn(ODOO_HOST, { hasHead: true, navigation });
  const history = () =>
    posted
      .filter(m => JSON.parse(m).type === PAGE_HISTORY_MESSAGE)
      .map(parsePageHistoryMessage);
  expect(history()).toEqual([false]); // once per document, not per run

  navigation.canGoBack = true; // Odoo pushState
  navigation.fire!();
  expect(history()).toEqual([false, true]);
});

test('no Navigation API (old WebView): no history messages', () => {
  const { posted } = runOn(ODOO_HOST, { hasHead: true });
  expect(types(posted)).not.toContain(PAGE_HISTORY_MESSAGE);
});

test('parsePageHistoryMessage', () => {
  const msg = (o: object) =>
    JSON.stringify({ type: PAGE_HISTORY_MESSAGE, ...o });
  expect(parsePageHistoryMessage(msg({ canGoBack: true }))).toBe(true);
  expect(parsePageHistoryMessage(msg({ canGoBack: false }))).toBe(false);
  expect(parsePageHistoryMessage(msg({ canGoBack: 'yes' }))).toBeNull();
  expect(
    parsePageHistoryMessage('{"type":"other","canGoBack":true}'),
  ).toBeNull();
  expect(parsePageHistoryMessage('nope')).toBeNull();
});
