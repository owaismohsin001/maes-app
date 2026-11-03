import { ODOO_ORIGIN } from '../config';
import { hostOf } from './odooUrl';

/**
 * CSS the app adds to Odoo's own pages. The website layout (login, password
 * reset, portal) carries the public website's footer, which has no place in
 * the app.
 */
export const ODOO_APP_CSS =
  '#wrapwrap > footer#bottom { display: none !important; }';

export const ODOO_APP_STYLE_ID = 'maes-app-style';

/** `type` of the message the page script posts with its edge colours. */
export const PAGE_COLORS_MESSAGE = 'maes:page-colors';

/**
 * `type` of the message the page script posts once the page can be shown: the
 * Odoo web client after it rendered its first screen, any other page once
 * loaded (at most 5 s after the load event either way).
 */
export const PAGE_READY_MESSAGE = 'maes:page-ready';

/**
 * `type` of the message with the page's own view of its history
 * (`navigation.canGoBack`), sent at start, on every history entry change
 * (Odoo's in-app navigation included) and when restored from the back/forward
 * cache.
 */
export const PAGE_HISTORY_MESSAGE = 'maes:history';

/** Background colours touching the top and bottom of the WebView. */
export type PageColors = { top: string; bottom: string };

/**
 * Injected into every page, at document start and again after load:
 * - Odoo pages get `ODOO_APP_CSS`.
 * - Every ~300 ms, the solid background colour under the top and bottom edge
 *   is posted to the app when it changed, so the status bar and navigation
 *   bar areas can match the page (`parsePageColorsMessage`).
 * - Once the page is ready to be shown, `PAGE_READY_MESSAGE` is posted (after
 *   the colours), so the splash can stay up until then.
 * - `PAGE_HISTORY_MESSAGE` whenever the page's history position changes, for
 *   the Android back button.
 *
 * The guard is per document, not per window: Android may run the early copy
 * while the previous document is still in place, and the window object can
 * outlive it. Timer callbacks read the current `document`, so the early copy
 * keeps (re)adding the style for 5 s to catch the new page as soon as it
 * exists; the after-load copy is the safety net.
 */
export const ODOO_PAGE_SCRIPT = `(function () {
  if (document.__maesPageScript) return;
  document.__maesPageScript = true;

  function addStyle() {
    if (location.hostname !== ${JSON.stringify(hostOf(ODOO_ORIGIN))} ||
        document.getElementById(${JSON.stringify(ODOO_APP_STYLE_ID)})) return;
    var parent = document.head || document.documentElement;
    if (!parent) return;
    var style = document.createElement('style');
    style.id = ${JSON.stringify(ODOO_APP_STYLE_ID)};
    style.textContent = ${JSON.stringify(ODOO_APP_CSS)};
    parent.appendChild(style);
  }

  // First (mostly) opaque background colour from el up to the root, as rgb().
  function solidBackground(el) {
    for (; el && el.nodeType === 1; el = el.parentElement) {
      var m = /rgba?\\((\\d+), (\\d+), (\\d+)(?:, ([\\d.]+))?\\)/.exec(
        getComputedStyle(el).backgroundColor);
      if (m && (m[4] === undefined || parseFloat(m[4]) >= 0.5)) {
        return 'rgb(' + m[1] + ', ' + m[2] + ', ' + m[3] + ')';
      }
    }
    return null;
  }
  function edgeColor(y) {
    return solidBackground(document.elementFromPoint(1, y)) ||
      solidBackground(document.body) || 'rgb(255, 255, 255)';
  }

  var last = '';
  function report() {
    if (document.hidden || !document.body || !window.ReactNativeWebView) return;
    var top = edgeColor(0);
    var bottom = edgeColor(window.innerHeight - 1);
    if (top + bottom === last) return;
    last = top + bottom;
    window.ReactNativeWebView.postMessage(JSON.stringify(
      { type: ${JSON.stringify(
        PAGE_COLORS_MESSAGE,
      )}, top: top, bottom: bottom }));
  }

  addStyle();
  var ticks = 0;
  var early = setInterval(function () {
    addStyle();
    if (++ticks >= 200) clearInterval(early);
  }, 25);
  document.addEventListener('DOMContentLoaded', report);
  setInterval(function () {
    addStyle();
    report();
  }, 300);

  var nav = window.navigation;
  function postHistory() {
    if (!nav || !window.ReactNativeWebView) return;
    window.ReactNativeWebView.postMessage(JSON.stringify(
      { type: ${JSON.stringify(
        PAGE_HISTORY_MESSAGE,
      )}, canGoBack: nav.canGoBack }));
  }
  if (nav) nav.addEventListener('currententrychange', postHistory);
  if (window.addEventListener) window.addEventListener('pageshow', postHistory);
  postHistory();

  var loadedAt = 0;
  var ready = setInterval(function () {
    if (!window.ReactNativeWebView || document.readyState !== 'complete') return;
    loadedAt = loadedAt || Date.now();
    var waitingForWebClient = document.querySelector('.o_web_client') &&
      !document.querySelector('.o_action_manager > *');
    if (waitingForWebClient && Date.now() - loadedAt < 5000) return;
    clearInterval(ready);
    report();
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: ${JSON.stringify(PAGE_READY_MESSAGE)} }));
  }, 100);
})();
true;`;

const RGB_RE = /^rgb\((\d{1,3}), (\d{1,3}), (\d{1,3})\)$/;
const HEX_RE = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/** [r, g, b] of an `rgb(r, g, b)` or `#rrggbb` colour, or null. */
function channels(color: string): [number, number, number] | null {
  const rgb = RGB_RE.exec(color);
  const values = rgb
    ? rgb.slice(1).map(Number)
    : HEX_RE.exec(color)
        ?.slice(1)
        .map(h => parseInt(h, 16));
  if (!values || values.some(v => v > 255)) {
    return null;
  }
  return [values[0], values[1], values[2]];
}

/** The page script's message, validated; null for anything else. */
export function parsePageColorsMessage(data: string): PageColors | null {
  try {
    const msg = JSON.parse(data);
    if (
      msg?.type === PAGE_COLORS_MESSAGE &&
      typeof msg.top === 'string' &&
      typeof msg.bottom === 'string' &&
      RGB_RE.test(msg.top) &&
      RGB_RE.test(msg.bottom) &&
      channels(msg.top) &&
      channels(msg.bottom)
    ) {
      return { top: msg.top, bottom: msg.bottom };
    }
  } catch {
    // not ours
  }
  return null;
}

/** `canGoBack` from the page script's history message; null for anything else. */
export function parsePageHistoryMessage(data: string): boolean | null {
  try {
    const msg = JSON.parse(data);
    return msg?.type === PAGE_HISTORY_MESSAGE &&
      typeof msg.canGoBack === 'boolean'
      ? msg.canGoBack
      : null;
  } catch {
    return null;
  }
}

/** True for the page script's "ready to be shown" message. */
export function isPageReadyMessage(data: string): boolean {
  try {
    return JSON.parse(data)?.type === PAGE_READY_MESSAGE;
  } catch {
    return false;
  }
}

/** True when dark text/icons read better on `color` (YIQ brightness). */
export function isLightColor(color: string): boolean {
  const c = channels(color);
  if (!c) {
    return true;
  }
  return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 >= 150;
}
