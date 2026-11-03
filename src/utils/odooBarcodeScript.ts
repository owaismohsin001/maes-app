/** `type` of the message reporting how Odoo took a code (see `odooBarcodeScript`). */
export const BARCODE_RESULT_MESSAGE = 'maes:barcode-result';

/** `type` of the message asking the app to open its scanner screen. */
export const OPEN_SCANNER_MESSAGE = 'maes:open-scanner';

/** `type` of the message with the page's current URL. */
export const PAGE_URL_MESSAGE = 'maes:url';

/** Odoo's answer to a code: the worst notification it showed, if any. */
export type BarcodeResult = {
  id: string;
  level: 'ok' | 'info' | 'warning' | 'error';
  message: string;
};

/** How long Odoo gets to show a notification about a code. */
export const BARCODE_RESULT_DELAY_MS = 1500;

/**
 * Odoo's own scan buttons in the Barcode app, which open the phone camera:
 * "Scan or tap" on the main menu, the barcode button on the operations list
 * and in an operation, and the generic `barcodes.BarcodeScanner` button.
 */
const ODOO_SCAN_BUTTONS =
  '.o_barcode_tap_to_scan, .o_stock_mobile_barcode, .o_mobile_barcode';

/**
 * Script that hands a scanned code to the Odoo page, the way a USB scanner
 * typing into the browser would. Read from Odoo 19's
 * `barcodes/static/src/barcode_service.js`:
 *
 * - Odoo listens for `keydown` on `document.body`. On mobile Chrome, which
 *   includes Android's WebView, it keeps a hidden `input.o-barcode-input` and,
 *   on Enter, takes the barcode from that input's value.
 * - Elsewhere it collects single-character keydowns and fires on Enter.
 * - Keys aimed at an editable field (a search box, a form field) are left to
 *   that field. So when one has focus, the code is typed into it instead,
 *   followed by Enter, like a scanner with an Enter suffix.
 *
 * Either way Odoo then does what it does for any scanner: the Barcode app
 * opens the product, location or transfer, fills in a serial, and so on.
 *
 * With an `id`, the notifications Odoo shows in the next
 * `BARCODE_RESULT_DELAY_MS` (e.g. "no product for this barcode") are posted
 * back as a `BARCODE_RESULT_MESSAGE`: the app's scanner screen covers Odoo's.
 */
export function odooBarcodeScript(code: string, id = ''): string {
  return `(function (code, id) {
  var d = document;
  function key(target, k) {
    var init = { key: k, bubbles: true, cancelable: true };
    if (k === 'Enter') {
      init.code = 'Enter';
      init.keyCode = 13;
      init.which = 13;
    }
    target.dispatchEvent(new KeyboardEvent('keydown', init));
    target.dispatchEvent(new KeyboardEvent('keyup', init));
  }
  function fire(target, type) {
    target.dispatchEvent(new Event(type, { bubbles: true }));
  }
  function notifications() {
    return Array.prototype.slice.call(d.querySelectorAll('.o_notification'));
  }
  var before = notifications();

  var el = d.activeElement;
  var hidden = d.querySelector('input.o-barcode-input');
  var field = el && el !== d.body && el !== hidden && el.matches &&
    el.matches('input, textarea, [contenteditable="true"]') &&
    !(el.dataset && el.dataset.enableBarcode) &&
    el.getAttribute('barcode_events') !== 'true';

  if (field) {
    if (el.isContentEditable) {
      d.execCommand('insertText', false, code);
    } else {
      try {
        el.setRangeText(code, el.selectionStart, el.selectionEnd, 'end');
      } catch (e) {
        // number/email inputs have no selection API
        el.value = el.value + code;
      }
      fire(el, 'input');
    }
    key(el, 'Enter');
    if (!el.isContentEditable) fire(el, 'change');
  } else if (hidden) {
    hidden.value = code;
    key(hidden, 'Enter');
  } else {
    var target = el || d.body;
    for (var i = 0; i < code.length; i++) key(target, code.charAt(i));
    key(target, 'Enter');
  }

  if (!id || !window.ReactNativeWebView) return;
  var RANK = { ok: 0, info: 1, warning: 2, error: 3 };
  setTimeout(function () {
    var level = 'ok';
    var message = '';
    notifications().forEach(function (n) {
      if (before.indexOf(n) !== -1) return;
      var bar = n.querySelector('.o_notification_bar');
      var cls = bar ? bar.className : '';
      var l = /bg-danger/.test(cls) ? 'error' :
        /bg-warning/.test(cls) ? 'warning' : 'info';
      if (RANK[l] > RANK[level]) {
        level = l;
        var content = n.querySelector('.o_notification_content') || n;
        message = (content.textContent || '').trim();
      }
    });
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: ${JSON.stringify(BARCODE_RESULT_MESSAGE)},
      id: id, level: level, message: message
    }));
  }, ${BARCODE_RESULT_DELAY_MS});
})(${JSON.stringify(code)}, ${JSON.stringify(id)});
true;`;
}

/**
 * Injected into every page next to the general page script when the device
 * has the scanner module:
 * - posts the page URL at start and on every history entry change (Odoo
 *   navigates in-page), so the app knows when the Barcode app is open;
 * - turns Odoo's own scan buttons (`ODOO_SCAN_BUTTONS`) into "open the app's
 *   scanner screen" instead of the phone camera. The listener runs in the
 *   capture phase on the document, so Odoo's handlers never see the click.
 */
export const ODOO_SCANNER_PAGE_SCRIPT = `(function () {
  if (document.__maesScannerScript) return;
  document.__maesScannerScript = true;
  var BARCODE_HREF = /^(https?:\\/\\/[^/]+)?\\/odoo\\/barcode(-[a-z]+)?([/?#]|$)/;

  function post(msg) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }
  }
  function postUrl() {
    if (typeof location.href === 'string') {
      post({ type: ${JSON.stringify(PAGE_URL_MESSAGE)}, url: location.href });
    }
  }
  if (window.navigation) {
    window.navigation.addEventListener('currententrychange', postUrl);
  }
  window.addEventListener('pageshow', postUrl);
  postUrl();

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    // The Barcode app's tile on the home menu: open the scanner screen right
    // away (Odoo still opens the app underneath), so Odoo's own screen never
    // flashes up first.
    var tile = t.closest('a.o_app');
    if (tile && BARCODE_HREF.test(tile.getAttribute('href') || '')) {
      post({ type: ${JSON.stringify(OPEN_SCANNER_MESSAGE)} });
      return;
    }
    if (!t.closest(${JSON.stringify(ODOO_SCAN_BUTTONS)})) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    post({ type: ${JSON.stringify(OPEN_SCANNER_MESSAGE)} });
  }, true);
})();
true;`;

function parse(data: string): Record<string, unknown> | null {
  try {
    const msg = JSON.parse(data);
    return msg && typeof msg === 'object' ? msg : null;
  } catch {
    return null;
  }
}

const LEVELS: ReadonlyArray<BarcodeResult['level']> = [
  'ok',
  'info',
  'warning',
  'error',
];

/** The barcode script's result message, validated; null for anything else. */
export function parseBarcodeResultMessage(data: string): BarcodeResult | null {
  const msg = parse(data);
  if (
    msg?.type === BARCODE_RESULT_MESSAGE &&
    typeof msg.id === 'string' &&
    typeof msg.message === 'string' &&
    LEVELS.includes(msg.level as BarcodeResult['level'])
  ) {
    return {
      id: msg.id,
      level: msg.level as BarcodeResult['level'],
      message: msg.message,
    };
  }
  return null;
}

/** The page URL from the scanner page script; null for anything else. */
export function parsePageUrlMessage(data: string): string | null {
  const msg = parse(data);
  return msg?.type === PAGE_URL_MESSAGE && typeof msg.url === 'string'
    ? msg.url
    : null;
}

/** True when the page asked for the app's scanner screen. */
export function isOpenScannerMessage(data: string): boolean {
  return parse(data)?.type === OPEN_SCANNER_MESSAGE;
}
