/** `type` of the message reporting how Odoo took a code (see `odooBarcodeScript`). */
export const BARCODE_RESULT_MESSAGE = 'maes:barcode-result';

/** Odoo's answer to a code: the worst notification it showed, if any. */
export type BarcodeResult = {
  id: string;
  level: 'ok' | 'info' | 'warning' | 'error';
  message: string;
};

/** How long Odoo gets to show a notification about a code. */
export const BARCODE_RESULT_DELAY_MS = 1500;

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
 * Since v1.6 this is only the fallback: the app first types the code as real
 * Android key events (`NativeMaesScanner.typeText`, like a keyboard-wedge
 * scanner) and uses this script when that isn't possible.
 *
 * With an `id`, the notifications Odoo shows in the next
 * `BARCODE_RESULT_DELAY_MS` (e.g. "no product for this barcode") are posted
 * back as a `BARCODE_RESULT_MESSAGE`.
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
