/**
 * @format
 */

import {
  BARCODE_RESULT_DELAY_MS,
  BARCODE_RESULT_MESSAGE,
  odooBarcodeScript,
  parseBarcodeResultMessage,
} from '../src/utils/odooBarcodeScript';

jest.useFakeTimers();

// Just enough DOM to run the scripts outside a browser.
class FakeEvent {
  type: string;
  key?: string;
  constructor(type: string, init: Record<string, unknown> = {}) {
    this.type = type;
    Object.assign(this, init);
  }
}

type FakeElement = {
  kind: 'body' | 'field' | 'hidden' | 'button';
  value: string;
  selectionStart: number;
  selectionEnd: number;
  isContentEditable: boolean;
  dataset: Record<string, string>;
  events: FakeEvent[];
  dispatchEvent: (e: FakeEvent) => boolean;
  matches: (selector: string) => boolean;
  getAttribute: (name: string) => string | null;
  setRangeText: (text: string, start: number, end: number) => void;
};

function element(kind: FakeElement['kind'], value = ''): FakeElement {
  const el: FakeElement = {
    kind,
    value,
    selectionStart: value.length,
    selectionEnd: value.length,
    isContentEditable: false,
    dataset: {},
    events: [],
    dispatchEvent: e => {
      el.events.push(e);
      return true;
    },
    // The script only asks "is this an editable field?"
    matches: () => kind === 'field' || kind === 'hidden',
    getAttribute: () => null,
    setRangeText: (text, start, end) => {
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
    },
  };
  return el;
}

/** An Odoo notification as `web.NotificationWowl` renders it. */
const notification = (type: string, text: string) => ({
  querySelector: (sel: string) =>
    sel === '.o_notification_bar'
      ? { className: `o_notification_bar bg-${type} rounded-start` }
      : { textContent: `  ${text} ` },
});

function run(
  code: string,
  {
    active,
    hidden,
    id,
    notifyAfter = [],
  }: {
    active?: FakeElement | null;
    hidden?: FakeElement | null;
    id?: string;
    /** Notifications Odoo shows in reaction to the code. */
    notifyAfter?: object[];
  },
) {
  const body = element('body');
  const notifications: object[] = [notification('info', 'Old news')];
  const posted: Record<string, unknown>[] = [];
  const document = {
    body,
    activeElement: active ?? body,
    querySelector: (selector: string) =>
      selector === 'input.o-barcode-input' ? hidden ?? null : null,
    querySelectorAll: () => notifications.slice(),
    execCommand: jest.fn(),
  };
  const window = {
    ReactNativeWebView: {
      postMessage: (m: string) => posted.push(JSON.parse(m)),
    },
  };
  // Executing the script string is the point: it is what the WebView runs.
  // eslint-disable-next-line no-new-func
  new Function(
    'document',
    'window',
    'KeyboardEvent',
    'Event',
    'setTimeout',
    odooBarcodeScript(code, id),
  )(document, window, FakeEvent, FakeEvent, setTimeout);
  notifications.push(...notifyAfter);
  jest.advanceTimersByTime(BARCODE_RESULT_DELAY_MS);
  return { body, posted };
}

const summary = (el: FakeElement) =>
  el.events.map(e => `${e.type}:${e.key ?? ''}`);

test("Odoo's hidden barcode input (mobile/WebView): value set, then Enter", () => {
  const hidden = element('hidden');
  const { body } = run('5412345678901', { hidden });

  expect(hidden.value).toBe('5412345678901');
  expect(summary(hidden)).toEqual(['keydown:Enter', 'keyup:Enter']);
  expect(body.events).toEqual([]);
});

test('a focused field gets the code typed at the cursor, then Enter', () => {
  const hidden = element('hidden');
  const field = element('field', 'SN-');
  run('0042', { active: field, hidden });

  expect(field.value).toBe('SN-0042');
  expect(summary(field)).toEqual([
    'input:',
    'keydown:Enter',
    'keyup:Enter',
    'change:',
  ]);
  expect(hidden.value).toBe('');
});

test('without the hidden input (desktop layout): one keydown per character, then Enter', () => {
  const { body } = run('AB1', {});

  expect(body.events.filter(e => e.type === 'keydown').map(e => e.key)).toEqual(
    ['A', 'B', '1', 'Enter'],
  );
});

test('a non-editable focused element still gets the keys (they bubble to Odoo)', () => {
  const button = element('button');
  const { body } = run('X9', { active: button });

  expect(summary(button)).toContain('keydown:Enter');
  expect(body.events).toEqual([]);
});

test('quotes, backslashes and markup in a code arrive unchanged', () => {
  const hidden = element('hidden');
  const nasty = 'a"b\'c\\d</script>\u2028e';
  run(nasty, { hidden });

  expect(hidden.value).toBe(nasty);
});

test("reports Odoo's worst new notification for the code; older ones don't count", () => {
  const { posted } = run('TEST-404', {
    hidden: element('hidden'),
    id: 'scan-1',
    notifyAfter: [
      notification('success', 'Something else'),
      notification('danger', 'No product found for TEST-404'),
    ],
  });

  expect(posted).toEqual([
    {
      type: BARCODE_RESULT_MESSAGE,
      id: 'scan-1',
      level: 'error',
      message: 'No product found for TEST-404',
    },
  ]);
});

test('no new notification: reported as ok; without an id nothing is reported', () => {
  const ok = run('TEST-1', { hidden: element('hidden'), id: 'scan-2' });
  expect(ok.posted).toEqual([
    { type: BARCODE_RESULT_MESSAGE, id: 'scan-2', level: 'ok', message: '' },
  ]);

  const silent = run('TEST-1', { hidden: element('hidden') });
  expect(silent.posted).toEqual([]);
});

test('parseBarcodeResultMessage accepts only well-formed results', () => {
  const msg = (o: object) =>
    JSON.stringify({ type: BARCODE_RESULT_MESSAGE, ...o });
  expect(
    parseBarcodeResultMessage(msg({ id: 'a', level: 'warning', message: 'm' })),
  ).toEqual({ id: 'a', level: 'warning', message: 'm' });
  expect(
    parseBarcodeResultMessage(msg({ id: 'a', level: 'fatal', message: '' })),
  ).toBeNull();
  expect(
    parseBarcodeResultMessage(msg({ level: 'ok', message: '' })),
  ).toBeNull();
  expect(parseBarcodeResultMessage('nope')).toBeNull();
});
